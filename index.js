const express = require("express");
const cors = require("cors");
require("dotenv").config();
var jwt = require("jsonwebtoken");
const app = express();
const port = process.env.PORT || 8000;

// middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { default: axios } = require("axios");
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
    const contactsCollection = client
      .db("serviceProvider")
      .collection("contacts");

    // middlewares
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorize access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorize access" });
        }
        req.decoded = decoded;
        next();
      });
    };
    // verify admin
    // verify admin mush be use after verify token coz (get email from decoded )
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // payment related apis
    const axios = require("axios");
    const qs = require("qs");
    app.post("/create-payment", async (req, res) => {
      const paymentInfo = req.body;
      console.log(paymentInfo);

      // Generate a unique transaction ID (can use appointment ID or another unique identifier)
      const transactionId = `TRANS_${Date.now()}`;

      const initiateData = {
        store_id: process.env.SSL_STORE_ID,
        store_passwd: process.env.SSL_STORE_PASSWORD,
        total_amount: paymentInfo.amount, // Dynamically set amount
        currency: "BDT",
        tran_id: transactionId, // Unique transaction ID
        success_url: `${process.env.BACKEND_URL}/success-payment`,
        fail_url: `${process.env.BACKEND_URL}/fail-payment`, // Update fail and cancel URLs
        cancel_url: `${process.env.BACKEND_URL}/cancel-payment`,
        cus_name: paymentInfo.customerName || "Customer Name", // Dynamically set customer name
        cus_email: paymentInfo.customerEmail || "cust@example.com", // Dynamically set customer email
        cus_add1: paymentInfo.customerAddress || "Dhaka", // Customer address
        cus_city: paymentInfo.customerCity || "Dhaka",
        cus_state: paymentInfo.customerState || "Dhaka",
        cus_postcode: paymentInfo.customerPostcode || "1000",
        cus_country: paymentInfo.customerCountry || "Bangladesh",
        cus_phone: paymentInfo.customerPhone || "01711111111",
        shipping_method: "NO",
        product_name: "Appointment",
        product_category: "Appointment",
        product_profile: "non-physical-goods",
        multi_card_name: "mastercard,visacard,amexcard", // Supported card types
        value_a: paymentInfo.valueA || "ref001_A", // Custom values for future reference
        value_b: paymentInfo.valueB || "ref002_B",
        value_c: paymentInfo.valueC || "ref003_C",
        value_d: paymentInfo.valueD || "ref004_D",
      };

      // Make the API call to SSLCommerz
      const response = await axios.post(
        "https://sandbox.sslcommerz.com/gwprocess/v4/api.php",
        qs.stringify(initiateData),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      res.send(response.data.GatewayPageURL);
    });

    app.post("/success-payment", async (req, res) => {
      const successData = req.body;
      console.log(successData);
    });

    // jwt related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        // expiresIn: "1h",
      });
      res.send({ token });
    });

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

    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });
    app.get("/user/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    // make admin
    app.patch("/user/admin/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
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
    app.post("/providers", verifyToken, verifyAdmin, async (req, res) => {
      // TODO: remove the user from user collection
      const providerInfo = req.body;
      const result = await providersCollection.insertOne(providerInfo);
      res.send(result);
    });

    // categories related apis

    app.get("/categories", async (req, res) => {
      const result = await categoriesCollection.find().toArray();
      res.send(result);
    });

    app.get("/category", async (req, res) => {
      const categoryName = req.query.category;

      const filter = { serviceProviderType: categoryName };
      const result = await categoriesCollection.findOne(filter);
      res.send(result);
    });

    // appointments  related  apis
    app.post("/appointments", verifyToken, async (req, res) => {
      const appointmentDetails = req.body;
      const result = await appointmentsCollection.insertOne(appointmentDetails);
      res.send(result);
    });

    app.get("/appointments", verifyToken, async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await appointmentsCollection.find(query).toArray();
      res.send(result);
    });

    // get all appointment data
    app.get("/AllAppointments", verifyToken, verifyAdmin, async (req, res) => {
      const result = await appointmentsCollection.find().toArray();
      res.send(result);
    });

    // delete single appointment by user
    app.delete("/appointments/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await appointmentsCollection.deleteOne(query);
      res.send(result);
    });

    // reviews related apis

    app.get("/reviews", async (req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    });

    app.post("/contacts", verifyToken, async (req, res) => {
      console.log("Route reached");
      // console.log(req.body);
      const contactSMSInfo = req.body;
      const result = await contactsCollection.insertOne(contactSMSInfo);
      res.send(result); // Make sure to send a response
    });
    app.get("/contacts", async (req, res) => {
      const result = await contactsCollection.find({}).toArray();
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
