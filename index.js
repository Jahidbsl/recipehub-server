const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

// =======================
// Middleware
// =======================
app.use(
  cors({
    origin: ["http://localhost:3000"],
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.disable("x-powered-by");

// =======================
// MongoDB Setup
// =======================
const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function startServer() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("✅ Connected to MongoDB!");

    // ── collections ──────────────────────────────────────────────────────────
    const db = client.db("recipehubDb");
    const recipesCollection = db.collection("recipes");
    const usersCollection = db.collection("user");
    const planCollection = db.collection("plan");
    const subscriptionCollection = db.collection("subcriptions");

    const likesCollection = db.collection("likes");
    const favoritesCollection = db.collection("favorites");
    const reportsCollection = db.collection("reports");
    const purchasesCollection = db.collection("purchases");

    // Like toggle
    app.post("/api/recipes/:id/like", async (req, res) => {
      const { userId } = req.body;
      const recipeId = req.params.id;

      const existing = await likesCollection.findOne({ recipeId, userId });
      if (existing) {
        await likesCollection.deleteOne({ recipeId, userId });
        await recipesCollection.updateOne(
          { _id: new ObjectId(recipeId) },
          { $inc: { likeCount: -1 } },
        );
        return res.send({ liked: false });
      }
      await likesCollection.insertOne({
        recipeId,
        userId,
        createdAt: new Date(),
      });
      await recipesCollection.updateOne(
        { _id: new ObjectId(recipeId) },
        { $inc: { likeCount: 1 } },
      );
      res.send({ liked: true });
    });

    // Favorite toggle
    app.post("/api/recipes/:id/favorite", async (req, res) => {
      const { userId } = req.body;
      const recipeId = req.params.id;

      const existing = await favoritesCollection.findOne({ recipeId, userId });
      if (existing) {
        await favoritesCollection.deleteOne({ recipeId, userId });
        return res.send({ favorited: false });
      }
      await favoritesCollection.insertOne({
        recipeId,
        userId,
        createdAt: new Date(),
      });
      res.send({ favorited: true });
    });

    // Report
    app.post("/api/recipes/:id/report", async (req, res) => {
      const { userId, reason, details } = req.body;
      const recipeId = req.params.id;

      const existing = await reportsCollection.findOne({ recipeId, userId });
      if (existing) return res.status(400).send({ error: "Already reported" });

      await reportsCollection.insertOne({
        recipeId,
        userId,
        reason,
        details,
        createdAt: new Date(),
      });
      res.send({ reported: true });
    });

    // Check user interactions (like/favorite status)
    app.get("/api/browse-recipes/:id/interactions", async (req, res) => {
      const { userId } = req.query;
      const recipeId = req.params.id;

      const liked = await likesCollection.findOne({ recipeId, userId });
      const favorited = await favoritesCollection.findOne({ recipeId, userId });
      const reported = await reportsCollection.findOne({ recipeId, userId });

      res.send({
        liked: !!liked,
        favorited: !!favorited,
        reported: !!reported,
      });
    });


    // purchases
app.post("/api/recipes/:recipeId/purchase", async (req, res) => {
  const { recipeId } = req.params;
  const { userId, amount, email } = req.body;

  await purchasesCollection.insertOne({
    userId,
    recipeId,
    amount,
    email,
    createdAt: new Date(),
  });

  res.send({
    success: true,
  });
});

    // ========================================================================
    // subcriptions ROUTES
    // ========================================================================
    app.post("/api/subscriptions", async (req, res) => {
      try {
        const data = req.body;

        const existing = await subscriptionCollection.findOne({
          stripeSubscriptionId: data.stripeSubscriptionId,
        });

        if (existing) {
          return res.send(existing);
        }

        const result = await subscriptionCollection.insertOne({
          ...data,
          createdAt: new Date(),
        });

        const filter = { email: data.email };
        console.log("Filtering with Email:", filter);

        const updateResult = await usersCollection.updateOne(filter, {
          $set: {
            plan: data.planId,
          },
        });

        console.log("Update Result:", updateResult);

        const updatedUser = await usersCollection.findOne(filter);
        console.log("Updated User:", updatedUser);

        res.send(updateResult);
      } catch (error) {
        console.error(error);
        res.status(500).send({
          error: error.message,
        });
      }
    });

    // ========================================================================
    // Plan ROUTES
    // ========================================================================

    app.get("/api/plans", async (req, res) => {
      const query = {};

      if (req.query.plan_id) {
        query.id = req.query.plan_id;
      }

      const plan = await planCollection.findOne(query);

      res.send(plan);
    });

    // ========================================================================
    // RECIPE ROUTES
    // ========================================================================
app.get("/api/browse-recipes/:id", async (req, res) => {
  try {
    console.log("ID:", req.params.id); // ← কী আসছে দেখো
    const recipe = await recipesCollection.findOne({
      _id: new ObjectId(req.params.id),
    });
    if (!recipe) return res.status(404).send({ error: "Not found" });
    res.send(recipe);
  } catch (err) {
    console.error("Recipe fetch error:", err.message);
    res.status(500).send({ error: err.message });
  }
});


    app.get("/api/recipes", async (req, res) => {
      const query = {};
      if (req.query.userId) {
        query.userId = req.query.userId;
      }
      if (req.query.category) query.category = req.query.category;
      if (req.query.cuisine) query.cuisine = req.query.cuisine;
      const cursor = recipesCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    // ── POST /api/recipes — add a new recipe ──────────────────────────────
    app.post("/api/recipes", async (req, res) => {
      const recipe = req.body;

      const newRecipe = {
        ...recipe,
        createdAt: new Date(),
      };
      const result = await recipesCollection.insertOne(newRecipe);

      // ✅ এটা add করুন
      if (result.insertedId) {
        res
          .status(201)
          .json({ success: true, message: "Recipe added successfully!" });
      } else {
        res
          .status(500)
          .json({ success: false, message: "Failed to add recipe" });
      }
    });

    // ========================================================================
    // HEALTH CHECK
    // ========================================================================
    app.get("/", (req, res) => {
      res.json({ status: "ok", message: "RecipeHub API is running 🍳" });
    });

    // ========================================================================
    // START SERVER
    // ========================================================================
    app.listen(port, () => {
      console.log(`🚀 Server running on port ${port}`);
    });
  } catch (error) {
    console.error("❌ Failed to connect to MongoDB:", error);
    process.exit(1);
  }
}

startServer();
