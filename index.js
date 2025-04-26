const express = require('express');
const app = express()
const port = process.env.PORT || 9000;
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');

const sampleProducts = require('./sample/sample-products.json');
const Product = require('./models/Product');
const User = require('./models/User');
const Order = require('./models/Order');



const allowedOrigins = ["http://localhost:5174", "https://scan-to-pay.vercel.app"];
app.use(cors(
  {
    origin: "*", // Adjust to match your frontend URL
    credentials: true  // ✅ Required for withCredentials to work
  }
));
app.use(express.json());

dotenv.config();

const uri = process.env.MONGO_URI;
const clientOptions = { serverApi: { version: '1', strict: true, deprecationErrors: true } };

async function run() {
  try {
    // Connect to MongoDB and keep the connection open
    await mongoose.connect(uri, clientOptions);
    console.log("✅ Successfully connected to MongoDB!");
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
    process.exit(1); // Stop the app if connection fails
  }
}

app.get('/', (req, res) => {
  res.send("Hullllaaaaa S2S!!!")
})

// Create a user
app.post('/users', async (req, res) => {
  // Implement guest user creation logic. When a user isntalls the pwa, pass the unique id generated
  // to the backend and create a user with that id.
  // This will be used to track the user and their orders.
})

// Get all products
app.get('/products', async (req, res) => {
  try {
    const products = await Product.find();
    res.status(200).json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a product by barcode
app.get('/products/:barcode', async (req, res) => {
  try {
    console.log(req.params.barcode);
    const product = await Product.findOne({ barcode: req.params.barcode });
    if (!product) {
      return res.status(404).json({ status: 404, message: 'Product not found' });
    }
    res.status(200).json({ status: 200, message: 'Product found', product });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/orders', async (req, res) => {
  try {

    const { items, customerId } = req.body;

    // Validate payload to ensure items is a non-empty array and customerId is a string.
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Items array is required and must not be empty',
      });
    }
    if (!customerId || (customerId === '')) {
      return res.status(400).json({
        success: false,
        error: 'Valid customerId is required',
      });
    }

    // Ensures scanned items have valid barcodes and positive quantities, catching errors early for better UX.
    for (const item of items) {
      if (!item.barcode || typeof item.quantity !== 'number' || item.quantity < 1) {
        return res.status(400).json({
          success: false,
          error: `Invalid barcode or quantity for item: ${JSON.stringify(item)}`,
        });
      }
    }

    // Collects valid items for the order and tracks missing or low-stock products for clear error messages.
    const validatedItems = [];
    const missingBarcodes = [];
    let subtotal = 0;

    // Ensures scanned barcodes match real products, preventing orders with invalid items (e.g., wrong barcode scanned).
    for (const item of items) {
      const product = await Product.findOne({ barcode: item.barcode });
      if (!product) {
        missingBarcodes.push(item.barcode);
      } else {
        const discountedPrice = product.price * (1 - product.discount / 100);
        validatedItems.push({
          productId: product._id,
          barcode: product.barcode,
          name: product.name,
          quantity: item.quantity,
          price: discountedPrice,
        });
        subtotal += discountedPrice * item.quantity;
      }
    }

    // WHAT: Return error if any barcodes are missing.
    // WHY: Lists all invalid barcodes so users can remove or rescan items, improving UX.
    if (missingBarcodes.length > 0) {
      return res.status(404).json({
        success: false,
        error: `Products not found for barcodes: ${missingBarcodes.join(', ')}`,
      });
    }

    // WHAT: Validate stock for all validated items.
    // WHY: Ensures the supermarket has enough stock, catching low stock early to avoid processing unfulfillable orders.
    const lowStockItems = [];
    for (let i = 0; i < validatedItems.length; i++) {
      const item = validatedItems[i];
      const product = await Product.findById(item.productId);
      if (product.quantity < item.quantity) {
        lowStockItems.push(product.name);
        validatedItems.splice(i, 1);
        i--;
      }
    }

    // WHAT: Return error if any items have low stock.
    // WHY: Informs users which products are unavailable so they can adjust their cart.
    if (lowStockItems.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Insufficient stock for products: ${lowStockItems.join(', ')}`,
      });
    }

    // WHAT: Calculate tax and total for the order.
    // WHY: Needed for the Order document and payment gateway (total amount to charge).
    const tax = subtotal * 0.05; // 5% tax, adjustable.
    const total = subtotal + tax;

    function generateTransactionReference(length) {
      const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let result = '';
      for (let i = 0; i < length; i++) {
        result += characters[Math.floor(Math.random() * characters.length)];
      }
      return result;
    }



    // WHAT: Generate a transaction reference.
    const transactionReference = generateTransactionReference(15);

    // WHAT: Create a new Order document.
    // WHY: Prepares the order with cart details, pricing, and payment info, ready for saving in the transaction.
    const order = new Order({
      customerId, // Links to User.customerId.
      items: validatedItems,
      receiptNumber: Date.now(),
      subtotal,
      tax,
      total,
      payment: {
        method: null, // Set after payment (e.g., 'card').
        amount: total,
        transactionReference,
      },
      status: 'created',
    });

    // --- TRANSACTION AND SESSION SECTION ---
    // WHAT: Start a MongoDB session for the transaction.
    // WHY: A session is a workspace that groups operations (user creation, stock updates, order save) into an atomic transaction, ensuring all succeed or none do.
    // WHY IN YOUR APP: Prevents overselling (e.g., two users scanning the last Coke) and ensures no user is created without a successful order.
    const session = await mongoose.startSession();

    // WHAT: Use try-catch to handle transaction errors and clean up the session.
    // WHY: Ensures the session is closed to avoid locking database resources, even if the transaction fails.
    try {
      // WHAT: Begin the transaction to make operations atomic.
      // WHY: Ensures user creation, stock updates, and order save either all happen or none do, preventing partial updates (e.g., user created but no order).
      // WHY IN YOUR APP: If stock is low or the server crashes, no changes (user, stock, order) are saved, and the user can retry with the same customerId.
      await session.withTransaction(async () => {
        // WHAT: Check if a user exists with the provided customerId.
        // WHY: Determines if we need to create a new user or use an existing one for the order.
        // WHY IN YOUR APP: Frontend sends customerId from localStorage; we check if it’s a first-time user.
        let user = await User.findOne({ customerId }).session(session);
        if (!user) {
          // WHAT: Create a new user if none exists.
          // WHY: Associates the customerId with a User document, but only if the transaction succeeds, preventing orphaned users.
          // WHY IN YOUR APP: A user is a “customer” only when they complete a purchase, so we create them only on successful checkout.
          user = new User({
            customerId
          });
          await user.save({ session });
        }

        // WHAT: Update stock for each validated item.
        // WHY: Reserves stock for the order, ensuring items are available and preventing overselling.
        for (const item of validatedItems) {
          // WHAT: Update product stock using updateOne.
          // WHY: updateOne ensures we update one product and allows atomic stock checks.
          const updateResult = await Product.updateOne(
            // WHAT: Match product by ID and ensure enough stock.
            // WHY: Verifies stock is still sufficient, catching cases where another user took stock.
            { _id: item.productId, quantity: { $gte: item.quantity } },
            // WHAT: Decrease stock and update timestamp.
            // WHY: Updates inventory and tracks changes.
            { $inc: { quantity: -item.quantity }, lastUpdated: Date.now() },
            // WHAT: Tie this update to the session.
            // WHY: Links the operation to the transaction for rollback if needed.
            { session }
          );

          // WHAT: Check if the stock update succeeded.
          // WHY: If matchedCount is 0, no product was updated (low stock), so we throw an error to cancel the transaction.
          // WHY IN YOUR APP: Prevents ordering unavailable items, ensuring users only pay for what’s in stock.
          if (updateResult.matchedCount === 0) {
            throw new Error(`Stock update failed for product: ${item.name} (likely insufficient stock)`);
          }
        }

        // WHAT: Save the order to the database.
        // WHY: Creates the order record with items, total, and payment details, but only if user creation and stock updates succeeded.
        // WHY IN YOUR APP: Ensures the order is only saved if we’ve secured the items and user, preventing payment for unavailable goods.
        await order.save({ session });
      });

      // WHAT: End the session after a successful transaction.
      // WHY: Frees database resources, as the transaction has committed all changes (user, stock, order).
      session.endSession();

      // WHAT: Send a success response with order details.
      // WHY: Informs the frontend the order was created, providing orderId, transactionReference, and amount for payment processing.
      // WHY IN YOUR APP: User can proceed to payment using these details.
      res.status(201).json({
        status: 201,
        success: true,
        orderId: order._id,
        transactionReference,
        amount: total,
        message: 'Order created, proceed to payment',
      });
    } catch (error) {
      // WHAT: End the session if the transaction fails.
      // WHY: Cleans up resources to avoid database locks.
      session.endSession();

      // WHAT: Rethrow the error to the outer catch block.
      // WHY: Allows handling transaction-specific errors (e.g., low stock) with appropriate responses.
      throw error;
    }
    // --- END TRANSACTION AND SESSION SECTION ---
  } catch (error) {
    // WHAT: Catch all errors (validation, database, transaction, etc.).
    // WHY: Ensures a response is always sent, improving reliability and UX.
    console.error('Order creation error:', error);

    // WHAT: Determine status code and message based on error type.
    // WHY: Provides clear feedback, distinguishing user errors (400, 404) from server issues (500).
    let status = 500;
    let errorMessage = 'Server error';
    if (error.message.includes('not found')) {
      status = 404; // Missing products.
      errorMessage = error.message;
    } else if (error.message.includes('stock')) {
      status = 400; // Low stock or transaction failure.
      errorMessage = error.message;
    } else if (error.message.includes('Invalid') || error.message.includes('customerId')) {
      status = 400; // Invalid payload or customerId.
      errorMessage = error.message;
    }

    // WHAT: Send error response.
    // WHY: Informs the user what went wrong so they can adjust and retry.
    res.status(status).json({
      success: false,
      error: errorMessage,
    });
  }
});

app.patch('/orders/:orderId/confirm-payment', async (req, res) => {
  try {
    // This endpoint will confirm and update payment for an order
    const { orderId } = req.params;
    const { transaction_status, transaction_type } = req.body;

    // Confirm payment and update the order status
    if (!orderId || transaction_type) {
      return res.status(400).json({ error: 'Transaction type and orderId are required' });
    }

    const order = await Order.findByIdAndUpdate(
      orderId,
      {
        'payment.method': transaction_type,
        'status': 'completed'
      }
    )

    if (!order) {
      return res.status(404).json({ status: 404, success: false, message: 'Order not found' });
    }

    return res.status(200).json({ status: 200, success: true, message: "Payment Confirmed, and order updated successfully!" });
  } catch (error) {
    console.error('Order update error:', error);
    return res.status(500).json({ success: false, error: 'Server error' });
  }

})

// Get all completed orders for a user
app.get('/orders/:id', async (req, res) => {
  // This endpoint will return all orders for a user
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({status: 400, message: 'Customer ID is required'});
    }
    const orders = await Order.find({ customerId: id, status: 'completed'});
    if (!orders) {
      return res.status(404).json({status: 404, message: 'No orders found for this user'});
    }
    res.status(200).json({status: 200, message: 'Orders retrieved', orders} )

  }catch(error) {
    res.status(500).json({status: 500, message: 'Server error'})
  }

  // Check to be sure the user exists

  // Return all orders for the user
})

// Get a specific order for a user. Use this to create a receipt
// and show the user their order history
app.get('/orders/:id/:orderId', async (req, res) => {
  // This endpoint will return a specific order for a user
  const { id, orderId } = req.params;
  if(!id || !orderId) {
    return res.status(400).json({status: 400, message: 'Customer ID and order ID are required'});
  }
  const order = await Order.find({customerId: id, _id: orderId});
  if (!order) {
    return res.status(404).json({status: 404, message: 'Order not found'});
  } 

  res.status(200).json({status: 200, message: 'Order retrieved', order} )
})


// Seed database with sample products
app.post('/seed', async (req, res) => {
  try {
    // Clear existing products
    await Product.deleteMany({});

    // Insert sample products
    const createdProducts = await Product.insertMany(sampleProducts);

    res.status(201).json({
      message: 'Database seeded successfully',
      count: createdProducts.length,
      products: createdProducts
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});


run().then(() => {
  app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
});
