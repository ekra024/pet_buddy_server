const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv')
dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ps6f07s.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db('petBuddyDB');
    const usersCollection = db.collection('users');
    const petsCollection = db.collection('pets');
    const campaignsCollection = db.collection('campaign');

    app.post('/users', async(req, res) => {
      const email = req.body.email;
      const userExists = await usersCollection.findOne({email});
      if(userExists) {
        return res.status(200).send({message: "User already exists", inserted: false});
      }

      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    })

    app.patch('/users', async(req, res) => {
      const {email} = req.body;
      if(!email) {
        return res.status(400).send({message: "Email is required"})
      }
      const current_log_in = new Date().toISOString();

      try{
        const result = await usersCollection.updateOne(
        {email : email},
         { $set: {last_log_in: current_log_in}}   
        );

        res.send(result);

      } catch(error) {
        res.status(500).send({message: "Failed to update status"})
      }
    })

    app.post('/pets', async(req, res) => {
      try{
        const pet = req.body;
      const result = await petsCollection.insertOne(pet);
      res.send(result);
      }catch(err){
         res.status(500).json({ error: "Internal server error" });
      }
      
    })

    app.get('/pets/available', async(req, res) => {
      try{
        const page = parseInt(req.query.page)||1;
        const limit = parseInt(req.query.limit)||6;
        const skip = (page -1)*limit;

        const {search="", category=""} = req.query;

        const query ={
          adoption: false,
          petName:{$regex: search, $options: "i"}
        }

        if(category) {
          query["category.value"] = category;
        }
        
        const pets = await petsCollection.find(query).skip(skip).limit(limit).sort({created_at: -1}).toArray();

        res.send({pets, nextPage:pets.length === limit ? page+1: null});

      }catch(err) {
        res.status(500).json({ error:
          "Internal Server Error"          
        })
      }
    })

    

    app.get('/pets/:email', async(req, res) => {
      const email = req.params.email;
      console.log(email);
      try{
        const result = await petsCollection.find({email: email}).toArray();
        console.log(result);
        res.send(result);
      }catch(err) {
        res.status(404).json({error: "Data is not Found"})
      }
    })

    app.post('/campaigns', async(req, res) => {
      try{
        const camp = req.body;
        const result = await campaignsCollection.insertOne(camp);
        res.send(result);
      }catch(err){
        res.status(500).json({error:"Internal Server Error"})
      }
    })

    app.get('/campaigns/:email', async(req, res) => {
      const email = req.params.email;
      try{
        const result = await campaignsCollection.find({userEmail: email}).toArray();
        console.log(result);
        res.send(result);
      }catch(err){
        res.status(404).json({error: 'Data Not found'})
      }
    })


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Successfully running petBuddy server!');
})

app.listen(port, () => {
  console.log(`Running petBuddy Server`)
})
