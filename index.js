const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

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
    await client.connect();

    const db = client.db("petBuddyDB");
    const usersCollection = db.collection("users");
    const petsCollection = db.collection("pets");
    const campaignsCollection = db.collection("campaign");
    const adoptionCollection = db.collection("adoptionPets");
    const donationsCollection = db.collection('donations');

    app.post("/users", async (req, res) => {
      const email = req.body.email;
      const userExists = await usersCollection.findOne({ email });
      if (userExists) {
        return res
          .status(200)
          .send({ message: "User already exists", inserted: false });
      }

      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

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

    app.put('/pets/:id', async(req, res) => {
      try{
        const id = req.params.id;
        const updatedPet = req.body;
        console.log(id);
        const result = await petsCollection.updateOne(
          {_id: new ObjectId(id)},
          {$set: updatedPet}
        );
        console.log(result);
        res.send(result);
      }catch(err){
        res.status(500).json({error: "Internal Server Error"});
      }
    })

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

    app.patch('/pets/adopt/:id', async(req, res) => {
      console.log('hit here adopt');
      try{
        const id = req.params.id;
      
        console.log(id);

        const result = await petsCollection.updateOne(
          {_id: new ObjectId(id)},
          {$set: {adoption: true}},
        )
        res.send(result);
      }catch(err) {
        res.status(500).json({error: "Internal Server Error"});
      }
    })

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

    app.get("/pets/user/:email", async (req, res) => {
      const email = req.params.email;
     
      try {
        const result = await petsCollection.find({ email: email }).toArray();
       
        res.send(result);
      } catch (err) {
        res.status(404).json({ error: "Data is not Found" });
      }
    });

    app.post('/pet/adoptions',async(req, res) => {
      try{
        const adoption = {
          ...req.body,
          status:"pending",
          createdAt: new Date(),
        };

        const result = await adoptionCollection.insertOne(adoption);
        res.send(result);

      }catch(err){
        res.status(500).json({error: "Failed to submit adoption request"});
      }
    })

    app.patch('/pet/adoptions/:id',async(req, res) => {
      try{
        const id = req.params.id;
        const {status} = req.body;
        const result = await adoptionCollection.updateOne(
          {_id: new ObjectId(id)},
          {$set: {status: status}}
        );
        res.send(result);
      }catch(err) {
        res.status(500).json({error: "Internal Server Error"});
      }
    })

    app.get('/pet/adoptions/user/:email',async(req, res) => {
      try{
        const email = req.params.email;
        console.log(email);
        
        const result = await adoptionCollection.find({
          ownerEmail: email
        }).toArray();
        
        res.send(result);
      }catch(err){
        res.status(500).json({error: "Internal Server Error"});
      }
    })


    app.post("/campaigns", async (req, res) => {
      try {
        const camp = req.body;
        
        const result = await campaignsCollection.insertOne(camp);
        res.send(result);
      } catch (err) {
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    app.get('/campaigns/available',async(req, res) => {
      try{
        const result = await campaignsCollection.find().sort({date:-1}).toArray();

        res.send(result);

      }catch(err){
        res.status(404).json({message:"Data is not Found"})
      }
    })

    app.get('/campaigns/:id', async(req, res) =>{
      try{
        const id = req.params.id;
        const result = await campaignsCollection.findOne({_id: new ObjectId(id) });
        res.send(result);
      }catch(err) {
        res.status(500).send({message:"Internal Server Error"})
      }
    })

    app.put('/campaigns/:id', async(req, res) => {
      try{
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
    })

    app.get("/campaigns/user/:email", async (req, res) => {
      
      const email = req.params.email;
   
      try {
        const result = await campaignsCollection
          .find({ userEmail: email })
          .toArray();
        
        res.send(result);
      } catch (err) {
        res.status(404).json({ error: "Data Not found" });
      }
    });

    app.delete('/campaigns/:id', async(req, res) => {
      try{
        const id = req.params.id; 
        const result = await campaignsCollection.deleteOne({_id: new ObjectId(id)});
        res.send(result);
      }catch(err){
        res.status(500).send({message:"Internal Server Error"})
      }
    })

    app.patch('/campaigns/donate/:id', async(req, res) => {
      try{
        const id = req.params.id;
        const { amount} = req.body;
        const result = await campaignsCollection.updateOne(
          {_id: new ObjectId(id)},
          {$inc: {donatedAmount: amount}}
        );
        res.send(result);
      }catch(err){
        res.status(500).send({message:"Internal Server Error"});      
      }
    })

    app.post('/donations',async (req, res) => {
      const donation = {
        ...req.body,
        createdAt : new Date(),
      };
      const donationAmount = Number(donation.amount);
      if(isNaN(donationAmount) || donationAmount <= 0) {
        return res.status(400).send({message: 'Invalid donation amount'});
      }
      const result = await donationsCollection.insertOne(donation);
      
      const updateResult = await campaignsCollection.updateOne(
        {_id: new ObjectId(donation.campaignId)},
        {$inc: {donatedAmount: donationAmount}}
      )
      
      if(updateResult.modifiedCount === 0) {
        return res.status(404).send({message:'Campaign not found'});
      }
      res.send(result);
      
    })

    app.get('/donations/campaign/:id',async(req, res) => {
      try{
        const campaignId = req.params.id;
        const result = await donationsCollection.find({campaignId: campaignId}).toArray();
        console.log(result);
        res.send(result);
      }catch(err){
        res.status(500).send({message:"Internal Server Error"});
      }
    })

    app.patch('/campaigns/pause/:id',async(req, res) => {
      try{
        const id = req.params.id;
        const {paused} = req.body;
        const result = await campaignsCollection.updateOne(
          {_id: new ObjectId(id)},
          {$set: {paused: paused}}
        );
        res.send(result);
      }catch(err){
        res.status(500).send({message:"Internal Server Error"});

      }
    })

    app.get('/donations/user/:email',async(req, res) => {
      try{
        const email = req.params.email;
        const result = await donationsCollection.find({donorEmail: email}).toArray();
        res.send(result);
      }catch(err){
        res.status(500).send({message:"Internal Server Error"});
      }
    })
    

    app.post('/create-payment-intent',async(req, res) => {
      const {amount} = req.body;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount * 100,
        currency: 'usd',
        payment_method_types: ['card'],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });

    })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
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
