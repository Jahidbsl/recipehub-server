const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

const port = process.env.PORT || 5000; 

const { MongoClient, ServerApiVersion } = require('mongodb');

// Middleware
app.use(cors({
    origin: ['http://localhost:3000'], 
    credentials: true
}));
app.use(express.json()); 

app.get('/', (req, res) => {
  res.send('RecipeHub Server is running successfully!');
});

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});



app.listen(port, () => {
  console.log(`🚀 RecipeHub app listening on port ${port}`);
});