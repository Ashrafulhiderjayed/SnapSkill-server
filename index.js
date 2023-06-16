const express = require('express'); 
const cors = require('cors');
require("dotenv").config();
const app = express();
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion } = require('mongodb');
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const port = process.env.PORT || 5000; 


//middleware
app.use(cors());
app.use(express.json());

//verify JWT token 
const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized access" });
    }

    //bearer token
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};


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

    app.post("/jwt", (req, res) => {
        const user = req.body;
        const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
          expiresIn: "1h",
        });
        res.send({ token });
      });

      //Admin verify 
    const verifyAdmin = async (req, res, next) => {
        email = req.decoded.email;
        const query = { email: email };
        const user = await usersCollection.findOne(query);
        if (user?.role !== "admin") {
          return res
            .status(403)
            .send({ error: true, message: "forbidden message" });
        }
        next();
      };

       //instructor verify 
    const verifyInstructor = async (req, res, next) => {
        email = req.decoded.email;
        const query = { email: email };
        const user = await usersCollection.findOne(query);
        if (user?.role !== "instructor") {
          return res
            .status(403)
            .send({ error: true, message: "forbidden message" });
        }
        next();
      };

      //Instructors api
    app.get("/instructors", async (req, res) => {
        const result = await usersCollection
          .find({ role: "instructor" })
          .limit(6)
          .toArray();
        res.send(result);
      });

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

    app.get("/popularClasses", async (req, res) => {
    const result = await classesCollection
        .find({ status: "approved" })
        .sort({ students: -1 })
        .toArray();
    res.send(result);
    });

    app.post("/add-class", verifyJWT, verifyInstructor, async (req, res) => {
        const newClass = req.body;
        const result = await classesCollection.insertOne(newClass);
        res.send(result);
      });

    app.patch("/class/approved/:id", async (req, res) => {
    const id = req.params.id;
    console.log(id);

    const filter = { _id: new ObjectId(id) };
    const updateDoc = {
        $set: {
        status: "approved",
        },
    };

    const result = await classesCollection.updateOne(filter, updateDoc);
    res.send(result);
    });  

    app.patch("/class/deny/:id", async (req, res) => {
        const id = req.params.id;
  
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            status: "denied",
          },
        };
  
        const result = await classesCollection.updateOne(filter, updateDoc);
        res.send(result);
      });

      //users related apis
    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
        const result = await usersCollection.find().toArray();
        res.send(result);
      });
  
      app.post("/users", async (req, res) => {
        const user = req.body;
        const query = { email: user.email };
        const existingUser = await usersCollection.findOne(query);
        console.log("existing user", existingUser);
        if (existingUser) {
          return res.send({ message: "user already exists!" });
        }
        const result = await usersCollection.insertOne(user);
        res.send(result);
      });

      

      //make admin
    app.patch("/users/admin/:id", async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);
      });

      //make instructor
    app.patch("/users/instructor/:id", async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            role: "instructor",
          },
        };
        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);
      });

      //check user admin or not?
    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
        const email = req.params.email;
        if (req.decoded.email !== email) {
          res.send({ admin: false });
        }
        const query = { email: email };
        const user = await usersCollection.findOne(query);
        const result = { admin: user?.role === "admin" };
        res.send(result);
      });

      //check user instructor or not?
    app.get("/users/instructor/:email", verifyJWT, async (req, res) => {
        const email = req.params.email;
        if (req.decoded.email !== email) {
          res.send({ instructor: false });
        }
        const query = { email: email };
        const user = await usersCollection.findOne(query);
        const result = { instructor: user?.role === "instructor" };
        res.send(result);
      });


    //cart collection api
    app.get("/carts", verifyJWT, async (req, res) => {
        const email = req.query.email;
        if (!email) {
          res.send([]);
        }
  
        //check user email and token email
        const decodedEmail = req.decoded.email;
        if (email !== decodedEmail) {
          return res
            .status(403)
            .send({ error: true, message: "forbidden access" });
        }
  
        const query = { email: email };
        const result = await cartCollection.find(query).toArray();
        res.send(result);
      });
  
      app.post("/carts", async (req, res) => {
        const item = req.body;
        console.log(item);
        const result = await cartCollection.insertOne(item);
        res.send(result);
      });
  
      app.delete("/carts/:id", async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await cartCollection.deleteOne(query);
        res.send(result);
      });
  
      //create payment intent
      app.post("/create-payment-intent", verifyJWT, async (req, res) => {
        const { price } = req.body;
        const amount = parseInt(price * 100);
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });
        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      });
  
      // //payment related apis
      //payment
      app.get("/payments", verifyJWT, async (req, res) => {
        const email = req.query.email;
        if (!email) {
          res.send([]);
        }
        //check user email and token email
        const decodedEmail = req.decoded.email;
        if (email !== decodedEmail) {
          return res
            .status(403)
            .send({ error: true, message: "forbidden access" });
        }
        const query = { email: email };
        const result = await paymentCollection.find(query).toArray();
        res.send(result);
      });
  
      app.post("/payments", verifyJWT, async (req, res) => {
        const payment = req.body;
        const id = payment.id;
        const filter = { id: id };
        const query = {
          _id: new ObjectId(payment.cartItems),
        };
        const insertResult = await paymentCollection.insertOne(payment);
        const deleteResult = await cartCollection.deleteOne(query);
        return res.send({ insertResult, deleteResult });
      });
  
      //update available seats
      app.patch("/all-classes/seats/:id", async (req, res) => {
        const id = req.params.id;
        console.log(id);
        const filter = { _id: new ObjectId(id) };
        const updateClass = await classesCollection.findOne(filter);
        if (!updateClass) {
          // Handle case when the seat is not found
          console.log("Seat not found");
          return;
        }
        const updateEnrollStudent = updateClass.students + 1;
        const updatedAvailableSeats = updateClass.available_seats - 1;
        const update = {
          $set: {
            available_seats: updatedAvailableSeats,
            students: updateEnrollStudent,
          },
        };
        const result = await classesCollection.updateOne(filter, update);
        console.log(result);
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
