const express = require('express'); 
const cors = require('cors');
const app = express();
const port = process.env.PORT || 5000; 


//middleware
app.use(cors());
app.use(express.json());



const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.dedsmmq.mongodb.net/?retryWrites=true&w=majority`;

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

    const classesCollection = client.db("summerCamp").collection("classes");
    const cartCollection = client.db("summerCamp").collection("carts");
    const usersCollection = client.db("summerCamp").collection("users");
    const paymentCollection = client.db("summerCamp").collection("payments");


    //classes
    app.get("/classes", async (req, res) => {
        const query = { status: "approved" };
        const result = await classesCollection.find(query).toArray();
        res.send(result);
      });
      app.get("/pendingClasses", verifyJWT, verifyAdmin, async (req, res) => {
        const result = await classesCollection.find().toArray();
        res.send(result);
      });

      
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);




app.get('/', (req, res) => { 
  res.send('HSummer Photo Camp Server is running!');
})


app.listen(port, () => {
    console.log(`Summer Photo Camp Server is running on port ${port}`);
  })
