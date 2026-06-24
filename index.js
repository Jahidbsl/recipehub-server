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
    origin: "https://recipehub-roan-sigma.vercel.app",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
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
    // await client.connect();
    // await client.db("admin").command({ ping: 1 });
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

    const sessionCollection = db.collection("session");

    // varification
    const logger = (req, res, next) => {
      console.log("Logger middleware Logged", req.params);
      next();
    };
    const verifyToken = async (req, res, next) => {
      try {
        const authHeader = req.headers?.authorization;

        if (!authHeader) {
          return res.status(401).send({
            message: "Unauthorized access",
          });
        }

        const token = authHeader.split(" ")[1];

        if (!token) {
          return res.status(401).send({
            message: "Unauthorized access",
          });
        }

        const session = await sessionCollection.findOne({ token });

        if (!session) {
          return res.status(401).send({
            message: "Invalid token",
          });
        }

        const user = await usersCollection.findOne({
          _id: new ObjectId(session.userId),
        });

        if (!user) {
          return res.status(401).send({
            message: "User not found",
          });
        }

        req.user = user;

        next();
      } catch (error) {
        console.error(error);
        res.status(500).send({
          message: "Internal Server Error",
        });
      }
    };
    const verifyAdmin = async (req, res, next) => {
      if (req.user?.role !== "admin") {
        return res.status(403).send({ Message: "forbidden access" });
      }
      next();
    };

    // ========================================================================
    // ALL TRANSACTIONS API (Admin Panel-এর জন্য Unified System)
    // ========================================================================
    app.get(
      "/api/admin/transactions",
      logger,
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          // ১. Purchases কালেকশন থেকে ডাটা তুলে আনা (Single Recipes - $4.99)
          const singlePurchases = await purchasesCollection.find({}).toArray();
          const mappedPurchases = singlePurchases.map((p) => ({
            transactionId: p._id?.toString(), // MongoDB direct core document Object ID
            user: p.email || p.userId || "Unknown User",
            amount: p.amount ? Number(p.amount) : 4.99, // Static standard safe pricing setup
            date: p.createdAt || new Date(),
            status: "Success", // Purchase logged mane payment complete
            type: "Recipe Buy 🍳",
          }));

          // ২. Subscriptions কালেকশন থেকে ডাটা তুলে আনা (Yearly Plans)
          const subscriptions = await subscriptionCollection.find({}).toArray();
          const mappedSubs = subscriptions.map((s) => {
            // Amount handle korar jonno dynamic system checks
            let subAmount = 0;
            if (s.amount) {
              subAmount = Number(s.amount);
            } else {
              // Database-e explicit schema price record na thakle conditional matching check
              subAmount =
                s.planId === "yearly" ||
                s.planId?.toLowerCase().includes("year")
                  ? 49.99
                  : 19.99;
            }

            return {
              transactionId: s.stripeSubscriptionId || s._id?.toString(), // Stripe processing key track
              user: s.email || "Premium Member",
              amount: subAmount,
              date: s.createdAt || new Date(),
              status: s.status || "Active", // Stripe active parameter sync mapping
              type: `Subscription (${s.planId || "Yearly"}) 💎`,
            };
          });

          // ৩. দুইটা ভিন্ন কালেকশনের ডেটা একসাথে মার্জ করা (Merged Array Queue)
          const allTransactions = [...mappedPurchases, ...mappedSubs];

          // ৪. ডেট অনুযায়ী লেটেস্ট ট্রানজেকশনগুলো সবার উপরে রাখা (Newest First)
          allTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

          res.status(200).json({ success: true, data: allTransactions });
        } catch (error) {
          console.error("Fetch Transactions Admin Error:", error);
          res
            .status(500)
            .json({
              success: false,
              message: "Server Error fetching transactions",
            });
        }
      },
    );
    // . সব রিপোর্ট একসাথে দেখার API (Admin Panel-এর জন্য)
app.get(
  "/api/admin/reports",
  logger,
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
      // কোনো এগ্রিগেশন বা জয়েন ছাড়া সরাসরি কালেকশনের সব ডাটা তুলে আনা হচ্ছে
      const reports = await db.collection("reports").find({}).toArray();
      
      console.log("Raw Reports from DB:", reports); // আপনার ব্যাকএন্ড কনসোলে ডাটা প্রিন্ট হবে
      res.status(200).json(reports);
    } catch (error) {
      console.error("Fetch Raw Reports Error:", error);
      res.status(500).json({ success: false, message: "Server Error" });
    }
  },
);

    // . Dismiss Report API (শুধু রিপোর্ট ডিলিট হবে, রেসিপি থাকবে)
    app.delete(
      "/api/admin/reports/:reportId/dismiss",
      logger,
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const { reportId } = req.params;

          const query = ObjectId.isValid(reportId)
            ? { _id: new ObjectId(reportId) }
            : { _id: reportId };
          const result = await reportsCollection.deleteOne(query);

          if (result.deletedCount === 0) {
            return res
              .status(404)
              .json({ success: false, message: "Report not found" });
          }

          res
            .status(200)
            .json({ success: true, message: "Report dismissed successfully!" });
        } catch (error) {
          res.status(500).json({ success: false, message: "Server Error" });
        }
      },
    );

    //  Delete Recipe & Reports API
    app.delete(
      "/api/admin/recipes/:recipeId",
      logger,
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const { recipeId } = req.params;

          const recipeQuery = ObjectId.isValid(recipeId)
            ? { _id: new ObjectId(recipeId) }
            : { _id: recipeId };
          await db.collection("recipes").deleteOne(recipeQuery);

          await reportsCollection.deleteMany({ recipeId: recipeId });

          res.status(200).json({
            success: true,
            message: "Recipe and associated reports deleted!",
          });
        } catch (error) {
          res.status(500).json({ success: false, message: "Server Error" });
        }
      },
    );

    // user api API
    app.get(
      "/api/users",
      logger,
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const users = await db.collection("user").find({}).toArray(); // 👈 এখানে "user" দিন
          res.status(200).json(users);
        } catch (error) {
          console.error("Fetch Users Error:", error);
          res
            .status(500)
            .json({ success: false, message: "Internal Server Error" });
        }
      },
    );

    // block/unblock api
    app.patch(
      "/api/users/:id/block",
      logger,
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const { id } = req.params;
          const { isBlocked } = req.body;

          if (!id) {
            return res
              .status(400)
              .json({ success: false, message: "Missing User ID parameter" });
          }

          // Build a strict query using standard $or wrapper arrays
          let userQuery = {};
          if (ObjectId.isValid(id)) {
            userQuery = {
              $or: [{ _id: id }, { _id: new ObjectId(id) }],
            };
          } else {
            userQuery = { _id: id };
          }

          // Execute update on target collection
          const userResult = await db
            .collection("user")
            .updateOne(userQuery, { $set: { isBlocked: Boolean(isBlocked) } });

          if (userResult.matchedCount === 0) {
            return res
              .status(404)
              .json({ success: false, message: "User not found in database!" });
          }

          if (isBlocked === true || isBlocked === "true") {
            // Clear out sessions. Better Auth links sessions via userId matching the original user document string key.
            const sessionResult = await db.collection("session").deleteMany({
              $or: [
                { userId: id },
                { userId: ObjectId.isValid(id) ? new ObjectId(id) : id },
              ],
            });

            console.log(
              `Force Logout Successful! Deleted ${sessionResult.deletedCount} active sessions.`,
            );
          }

          res.status(200).json({
            success: true,
            message: isBlocked
              ? "User blocked & kicked out successfully! 🚫"
              : "User unblocked successfully! ✅",
          });
        } catch (error) {
          console.error("Express Block Error:", error);
          res
            .status(500)
            .json({ success: false, message: "Internal Server Error" });
        }
      },
    );

    // admin api for recipes manage

    app.patch(
      "/api/recipes/:id",
      logger,
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const { id } = req.params;
          const { isFeatured } = req.body;

          console.log("Received ID:", id); // ডিবাগিং এর জন্য লগ
          console.log("Received Status:", isFeatured); // ডিবাগিং এর জন্য লগ

          if (!ObjectId.isValid(id)) {
            return res
              .status(400)
              .json({ success: false, message: "Invalid ID Format" });
          }

          const result = await db
            .collection("recipes")
            .updateOne(
              { _id: new ObjectId(id) },
              { $set: { isFeatured: Boolean(isFeatured) } },
            );

          if (result.matchedCount === 0) {
            return res
              .status(404)
              .json({ success: false, message: "Recipe not found!" });
          }

          res
            .status(200)
            .json({ success: true, message: "Updated in DB successfully!" });
        } catch (error) {
          console.error("PATCH Error:", error);
          res
            .status(500)
            .json({ success: false, message: "Internal Server Error" });
        }
      },
    );
    // upore sob admin api
    // user favorites API

    app.get(
      "/api/users/:userId/favorites",
      logger,
      verifyToken,
      async (req, res) => {
        try {
          const { userId } = req.params;
          if (!req.user || req.user._id.toString() !== userId) {
            return res.status(403).send({
              Message: "Forbidden: You cannot view another user's favorites",
            });
          }
          const userFavorites = await favoritesCollection
            .find({ userId })
            .toArray();

          if (!userFavorites.length) {
            return res.send([]);
          }

          const recipeIds = userFavorites.map(
            (fav) => new ObjectId(fav.recipeId),
          );

          const favoriteRecipes = await recipesCollection
            .find({
              _id: { $in: recipeIds },
            })
            .toArray();

          res.send(favoriteRecipes);
        } catch (error) {
          console.error("Favorites Error:", error);
          res.status(500).send({ error: error.message });
        }
      },
    );

    // user puschases API

    app.get(
      "/api/users/:userId/purchases",
      logger,
      verifyToken,
      async (req, res) => {
        try {
          const { userId } = req.params;
          if (!req.user || req.user._id.toString() !== userId) {
            return res.status(403).send({
              Message: "Forbidden: You cannot view another user's favorites",
            });
          }
          const userPurchases = await purchasesCollection
            .find({ userId })
            .toArray();

          if (!userPurchases.length) {
            return res.send([]);
          }

          const recipeIds = userPurchases.map(
            (purchase) => new ObjectId(purchase.recipeId),
          );

          const purchasedRecipes = await recipesCollection
            .find({
              _id: { $in: recipeIds },
            })
            .toArray();

          res.send(purchasedRecipes);
        } catch (error) {
          console.error("Purchases Error:", error);
          res.status(500).send({ error: error.message });
        }
      },
    );
    // Like toggle
    app.post("/api/recipes/:id/like", logger, verifyToken, async (req, res) => {
      const { userId } = req.body;
      const recipeId = req.params.id;

      if (!req.user || req.user._id.toString() !== userId) {
        return res.status(403).send({
          Message: "Forbidden: You cannot view another user's favorites",
        });
      }

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
    app.post(
      "/api/recipes/:id/favorite",
      logger,
      verifyToken,
      async (req, res) => {
        const { userId } = req.body;
        const recipeId = req.params.id;
        if (!req.user || req.user._id.toString() !== userId) {
          return res.status(403).send({
            Message: "Forbidden: You cannot view another user's favorites",
          });
        }
        const existing = await favoritesCollection.findOne({
          recipeId,
          userId,
        });
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
      },
    );

    // Report
    app.post(
      "/api/recipes/:id/report",
      logger,
      verifyToken,
      async (req, res) => {
        const { userId, reason, details } = req.body;
        const recipeId = req.params.id;
        if (!req.user || req.user._id.toString() !== userId) {
          return res.status(403).send({
            Message: "Forbidden: You cannot view another user's favorites",
          });
        }
        const existing = await reportsCollection.findOne({ recipeId, userId });
        if (existing)
          return res.status(400).send({ error: "Already reported" });

        await reportsCollection.insertOne({
          recipeId,
          userId,
          reason,
          details,
          createdAt: new Date(),
        });
        res.send({ reported: true });
      },
    );

    // Check user interactions (like/favorite status)
    app.get(
      "/api/browse-recipes/:id/interactions",
      logger,
      verifyToken,
      async (req, res) => {
        const { userId } = req.query;
        const recipeId = req.params.id;
        if (!req.user || req.user._id.toString() !== userId) {
          return res.status(403).send({
            Message: "Forbidden: You cannot view another user's favorites",
          });
        }
        const liked = await likesCollection.findOne({ recipeId, userId });
        const favorited = await favoritesCollection.findOne({
          recipeId,
          userId,
        });
        const reported = await reportsCollection.findOne({ recipeId, userId });

        res.send({
          liked: !!liked,
          favorited: !!favorited,
          reported: !!reported,
        });
      },
    );

    // Purchases Collection Route
    app.post("/api/purchases", async (req, res) => {
      try {
        const { userId, recipeId, amount, email } = req.body;

        // মঙ্গোডিবি কালেকশনে সফলভাবে ইনসার্ট করা
        const result = await purchasesCollection.insertOne({
          userId: userId || null,
          recipeId: recipeId || null,
          amount: amount ? Number(amount) : 4.99,
          email: email || null,
          createdAt: new Date(),
        });

        res.send({
          success: true,
          message: "Purchase logged successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Database Error:", error);
        res.status(500).send({ success: false, error: error.message });
      }
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

    app.get("/api/plans", logger, verifyToken, async (req, res) => {
      try {
        const { plan_id } = req.query;

        const targetId = plan_id || "free";

        const plan = await planCollection.findOne({ id: targetId });

        if (!plan) {
          return res.status(404).send({
            id: "free",
            name: "Free Plan",
            maxAddPerUser: 2,
            billingCycle: "none",
          });
        }

        res.send(plan);
      } catch (error) {
        console.error("Error fetching plan:", error);
        res.status(500).send({ message: "Internal server error" });
      }
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
    app.post("/api/recipes", logger, verifyToken, async (req, res) => {
      const recipe = req.body;

      const newRecipe = {
        ...recipe,
        createdAt: new Date(),
      };
      const result = await recipesCollection.insertOne(newRecipe);

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

    // update

    app.patch(
      "/api/recipes/update/:id",

      async (req, res) => {
        try {
          const id = req.params.id;
          const updatedData = req.body;

          const result = await recipesCollection.updateOne(
            { _id: new ObjectId(id) },
            {
              $set: {
                ...updatedData,
                updatedAt: new Date(),
              },
            },
          );

          if (result.matchedCount === 0) {
            return res.status(404).send({
              success: false,
              message: "Recipe not found",
            });
          }

          res.send({
            success: true,
            message: "Recipe updated successfully",
            modifiedCount: result.modifiedCount,
          });
        } catch (error) {
          res.status(500).send({
            success: false,
            error: error.message,
          });
        }
      },
    );
    // delate
    app.delete("/api/recipes/delete/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const result = await recipesCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).send({
            success: false,
            message: "Recipe not found",
          });
        }

        res.send({
          success: true,
          message: "Recipe deleted successfully",
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          error: error.message,
        });
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
