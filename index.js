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
    res.status(200).json({status: 200, message: 'Product found', product});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create order
app.post('/orders', async (req, res) => {
  // This endpoint expetcs product(s) and a user id to be sent in the payload

  // Check to be sure the user exists

  // check to be sure the product exits and is in stock

  // create the order

  // Ensure the product count is updated after a successful order

  // Return the order details if successful

  // Return an error if not successful

})

// Get all completed orders for a user
app.get('/orders/:id', async (req, res) => {
  // This endpoint will return all orders for a user
  // Check to be sure the user exists

  // Return all orders for the user
})

// Get a specific order for a user. Use this to create a receipt
// and show the user their order history
app.get('/orders/:id/:orderId', async (req, res) => {
  // This endpoint will return a specific order for a user
  // Check to be sure the user exists

  // Check to be sure the order exists

  // Return the order details
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
