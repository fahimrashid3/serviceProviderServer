const express = require("express");
const cors = require("cors");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 8000;

// middleware
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.maw05.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
    const providersCollection = client
      .db("serviceProvider")
      .collection("providers");
    const reviewsCollection = client
      .db("serviceProvider")
      .collection("reviews");
    const categoriesCollection = client
      .db("serviceProvider")
      .collection("categories");
    const appointmentsCollection = client
      .db("serviceProvider")
      .collection("appointments");
    const usersCollection = client.db("serviceProvider").collection("users");

    // user related apis
    app.post("/users", async (req, res) => {
      const user = req.body;
      // insert user if user is new
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      const existingProvider = await providersCollection.findOne(query);
      if (existingUser || existingProvider) {
        return res.send({
          message: "Already exist in database",
          insertedId: null,
        });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });
    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    // reviews related apis

    app.get("/reviews", async (req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    });

    // providers related apis
    app.get("/providers", async (req, res) => {
      const result = await providersCollection.find().toArray();
      res.send(result);
    });

    app.get("/providers/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await providersCollection.findOne(query);
      res.send(result);
    });

    // categories related apis

    app.get("/categories", async (req, res) => {
      const result = await categoriesCollection.find().toArray();
      res.send(result);
    });
    app.get("/category", async (req, res) => {
      const categoryName = req.query.category; // Get the category name from query params
      console.log("Requested Category:", categoryName);

      const filter = { serviceProviderType: categoryName };
      const result = await categoriesCollection.findOne(filter); // Use `findOne` to fetch a single matching category
      res.send(result);
    });

    // appointments  related  apis
    app.post("/appointments", async (req, res) => {
      const appointmentDetails = req.body;
      console.log(appointmentDetails);
      const result = await appointmentsCollection.insertOne(appointmentDetails);
      res.send(result);
    });
    app.get("/appointments", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await appointmentsCollection.find(query).toArray();
      res.send(result);
    });
    app.delete("/appointments/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await appointmentsCollection.deleteOne(query);
      res.send(result);
    });

    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("server is running");
});
app.listen(port, () => {
  console.log("server is running on port :", port);
});
