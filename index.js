require("dotenv").config();
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const decodedKey = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);
const serviceAccount = JSON.parse(decodedKey);

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const verifyUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).send({ message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];

    const decodedUser = await admin.auth().verifyIdToken(token);
    req.decoded = decodedUser;

    next();
  } catch (error) {
    return res.status(401).send({ message: "Invalid token" });
  }
};

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ps6f07s.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    //await client.connect();

    const db = client.db("petBuddyDB");
    const usersCollection = db.collection("users");
    const petsCollection = db.collection("pets");
    const campaignsCollection = db.collection("campaign");
    const adoptionCollection = db.collection("adoptionPets");
    const donationsCollection = db.collection("donations");

    const verifyAdmin = async (req, res, next) => {
      if (!req.decoded?.email) {
        return res.status(401).send({ message: "Unauthorized" });
      }

      const email = req.decoded.email;
      const user = await usersCollection.findOne({ email });

      if (!user || user.role != "admin") {
        return res.status(403).send({ message: "Forbidden access" });
      }
      next();
    };

    app.post("/users", async (req, res) => {
      const email = req.body.email;
      const date = new Date();
      const userExists = await usersCollection.findOne({ email });
      if (userExists) {
        await usersCollection.updateOne(
          { email },
          { $set: { last_log_in: date } }
        );

        return res
          .status(200)
          .send({ message: "User already exists", inserted: false });
      }

      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.get(
      "/allUsers/admin/:email",
      verifyUser,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;
        if (email !== req.decoded.email) {
          return res.status(403).send({
            message: "Unauthorized",
          });
        }
        try {
          const result = await usersCollection.find().toArray();
          res.send(result);
        } catch (error) {
          res.status(500).send({ message: "Failed to update status" });
        }
      }
    );

    app.patch("/users", async (req, res) => {
      const { email } = req.body;
      if (!email) {
        return res.status(400).send({ message: "Email is required" });
      }
      const current_log_in = new Date().toISOString();

      try {
        const result = await usersCollection.updateOne(
          { email: email },
          { $set: { last_log_in: current_log_in } }
        );

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to update status" });
      }
    });

    app.post("/pets", async (req, res) => {
      try {
        const pet = req.body;
        const result = await petsCollection.insertOne(pet);
        res.send(result);
      } catch (err) {
        res.status(500).json({ error: "Internal server error" });
      }
    });

    app.put("/pets/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const updatedPet = req.body;

        const result = await petsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedPet }
        );

        res.send(result);
      } catch (err) {
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    app.get("/pets/available", async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 6;
        const skip = (page - 1) * limit;

        const { search = "", category = "" } = req.query;

        const query = {
          adoption: false,
          petName: { $regex: search, $options: "i" },
        };

        if (category) {
          query["category.value"] = category;
        }

        const pets = await petsCollection
          .find(query)
          .skip(skip)
          .limit(limit)
          .sort({ created_at: -1 })
          .toArray();

        res.send({ pets, nextPage: pets.length === limit ? page + 1 : null });
      } catch (err) {
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    app.patch("/pets/adopt/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const result = await petsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { adoption: true } }
        );
        res.send(result);
      } catch (err) {
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    app.get("/pets/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const pet = await petsCollection.findOne({ _id: new ObjectId(id) });

        if (!pet) {
          return res.status(404).json({ message: "Pet not found" });
        }

        res.send(pet);
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });

    app.get("/pets/user/:email", verifyUser, async (req, res) => {
      const email = req.params.email;
      const userEmail = req.decoded.email;

      if (email != userEmail) {
        res.status(403).json({ message: "Unauthorized Access" });
      }
      try {
        const result = await petsCollection.find({ email: email }).toArray();

        res.send(result);
      } catch (err) {
        res.status(404).json({ error: "Data is not Found" });
      }
    });

    app.post("/pet/adoptions", async (req, res) => {
      try {
        const adoption = {
          ...req.body,
          status: "pending",
          createdAt: new Date(),
        };

        const result = await adoptionCollection.insertOne(adoption);
        res.send(result);
      } catch (err) {
        res.status(500).json({ error: "Failed to submit adoption request" });
      }
    });

    app.patch("/pet/adoptions/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;
        const { petId } = req.body;

        await adoptionCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: status } }
        );
        if (status === "accepted") {
          await petsCollection.updateOne(
            { _id: new ObjectId(petId) },
            { $set: { adoption: true } }
          );
        }
        res.send({ message: "Update complete" });
      } catch (err) {
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    app.get("/pet/adoptions/user/:email", verifyUser, async (req, res) => {
      const email = req.params.email;
      const userEmail = req.decoded.email;
      if (email != userEmail) {
        res.status(403).json({ message: "Unauthorized Access" });
      }
      try {
        const result = await adoptionCollection
          .find({
            ownerEmail: email,
          })
          .toArray();

        res.send(result);
      } catch (err) {
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    app.post("/campaigns", async (req, res) => {
      try {
        const camp = req.body;

        const result = await campaignsCollection.insertOne(camp);
        res.send(result);
      } catch (err) {
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    app.get("/campaigns/available", async (req, res) => {
      try {
        const result = await campaignsCollection
          .find()
          .sort({ date: -1 })
          .toArray();

        res.send(result);
      } catch (err) {
        res.status(404).json({ message: "Data is not Found" });
      }
    });

    app.get("/campaigns/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await campaignsCollection.findOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    app.put("/campaigns/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const updatedData = req.body;

        const result = await campaignsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData }
        );

        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    app.get("/campaigns/user/:email", verifyUser, async (req, res) => {
      const email = req.params.email;
      const userEmail = req.decoded.email;

      if (email != userEmail) {
        res.status(403).json({ message: "Unauthorized Access" });
      }
      try {
        const result = await campaignsCollection
          .find({ userEmail: email })
          .toArray();

        res.send(result);
      } catch (err) {
        res.status(404).json({ error: "Data Not found" });
      }
    });

    app.delete("/campaigns/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await campaignsCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    app.patch("/campaigns/donate/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { amount } = req.body;
        const result = await campaignsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $inc: { donatedAmount: amount } }
        );
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    app.post("/donations", async (req, res) => {
      const donation = {
        ...req.body,
        createdAt: new Date(),
      };
      const donationAmount = Number(donation.amount);
      if (isNaN(donationAmount) || donationAmount <= 0) {
        return res.status(400).send({ message: "Invalid donation amount" });
      }
      const result = await donationsCollection.insertOne(donation);

      const updateResult = await campaignsCollection.updateOne(
        { _id: new ObjectId(donation.campaignId) },
        { $inc: { donatedAmount: donationAmount } }
      );

      if (updateResult.modifiedCount === 0) {
        return res.status(404).send({ message: "Campaign not found" });
      }
      res.send(result);
    });

    app.get("/donations/campaign/:id", async (req, res) => {
      try {
        const campaignId = req.params.id;
        const result = await donationsCollection
          .find({ campaignId: campaignId })
          .toArray();

        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    app.patch("/campaigns/pause/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { paused } = req.body;
        const result = await campaignsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { paused: paused } }
        );
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    app.get("/donations/user/:email", verifyUser, async (req, res) => {
      const email = req.params.email;
      const userEmail = req.decoded.email;
      if (email != userEmail) {
        res.status(403).json({ message: "Unauthorized Access" });
      }
      try {
        const result = await donationsCollection
          .find({ donorEmail: email })
          .toArray();
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    app.post("/create-payment-intent", async (req, res) => {
      const { amount } = req.body;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount * 100,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.get("/dashboard/user/summary/:email", verifyUser, async (req, res) => {
      const email = req.params.email;

      if (email !== req.decoded.email) {
        return res.status(403).json({ message: "Unauthorized access" });
      }

      try {
        const totalPets = await petsCollection.countDocuments({
          email: email,
        });

        const adoptedPets = await petsCollection.countDocuments({
          requesterEmail: email,
          status: "accepted",
        });

        const campaigns = await campaignsCollection.countDocuments({
          userEmail: email,
        });

        const donations = await donationsCollection
          .find({ donorEmail: email })
          .toArray();

        const totalDonationAmount = donations.reduce(
          (sum, d) => sum + Number(d.amount||0),
          0
        );

        const recentPets = await petsCollection
          .find({ ownerEmail: email })
          .sort({ created_at: -1 })
          .limit(5)
          .toArray();

        const recentDonations = await donationsCollection
          .find({ donorEmail: email })
          .sort({ createdAt: -1 })
          .limit(5)
          .toArray();

        res.send({
          stats: {
            totalPets,
            adoptedPets,
            campaigns,
            totalDonationAmount,
          },
          recentPets,
          recentDonations,
        });
      } catch (err) {
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    app.get(
  "/dashboard/admin/summary",
  verifyUser,
  verifyAdmin,
  async (req, res) => {
    try {
      const totalUsers = await usersCollection.countDocuments();

      const totalPets = await petsCollection.countDocuments();

      const adoptedPets = await petsCollection.countDocuments({
        adopted: true,
      });

      const totalCampaigns = await campaignsCollection.countDocuments();

      const activeCampaigns = await campaignsCollection.countDocuments({
        paused: false,
      });

      const pausedCampaigns = await campaignsCollection.countDocuments({
        paused: true,
      });

      const donations = await donationsCollection.find().toArray();

      const totalDonationAmount = donations.reduce(
        (sum, d) => sum + Number(d.amount || 0),
        0
      );

      const recentPets = await petsCollection
        .find()
        .sort({ created_at: -1 })
        .limit(5)
        .toArray();

      const recentCampaigns = await campaignsCollection
        .find()
        .sort({ date: -1 })
        .limit(5)
        .toArray();

      const recentDonations = await donationsCollection
        .find()
        .sort({ createdAt: -1 })
        .limit(5)
        .toArray();

      res.send({
        stats: {
          totalUsers,
          totalPets,
          adoptedPets,
          totalCampaigns,
          activeCampaigns,
          pausedCampaigns,
          totalDonationAmount,
        },
        recentPets,
        recentCampaigns,
        recentDonations,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
);


    app.patch("/allUsers/admin/:id", async (req, res) => {
      const id = req.params.id;
      try {
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role: "admin" } }
        );
        res.send(result);
      } catch (err) {
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    app.get("/users/admin/:email", verifyUser, async (req, res) => {
      const email = req.params.email;

      const user = await usersCollection.findOne({ email });
      res.send({ admin: user?.role === "admin" });
    });

    app.get(
      "/allPets/admin/:email",
      verifyUser,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;
        if (email != req.decoded.email) {
          res.status(403).json({ message: "unauthorized acess" });
        }
        try {
          const result = await petsCollection.find().toArray();
          res.send(result);
        } catch (err) {
          res.status(500).json({ message: "Internal Server Error" });
        }
      }
    );

    app.get(
      "/allCampaigns/admin/:email",
      verifyUser,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;
        if (email != req.decoded.email) {
          res.status(403).json({ message: "unauthorized acess" });
        }
        try {
          const result = await campaignsCollection.find().toArray();
          res.send(result);
        } catch (err) {
          res.status(500).json({ message: "Internal Server Error" });
        }
      }
    );

    app.patch("/admin/campaigns/:id/status", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await campaignsCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              paused: false,
            },
          }
        );

        res.send(result);
      } catch (err) {
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    // Send a ping to confirm a successful connection
    //await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Successfully running petBuddy server!");
});

app.listen(port, () => {
  console.log(`Running petBuddy Server`);
});
