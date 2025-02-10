const express = require("express");
const cors = require("cors");
require("dotenv").config();
var jwt = require("jsonwebtoken");
const app = express();
const port = process.env.PORT || 8000;
const rateLimit = require("express-rate-limit");
// const { body, validationResult } = require("express-validator");

// middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
});
app.use("/jwt", limiter);

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
    const blogsCollection = client.db("serviceProvider").collection("blogs");

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
    // verify provider
    // verify provider mush be use after verify token coz (get email from decoded )
    const verifyProvider = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isProvider = user?.role === "provider";
      if (!isProvider) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // payment related apis
    const axios = require("axios");
    const qs = require("qs");
    app.post("/create-payment", async (req, res) => {
      const paymentInfo = req.body;

      // Generate a unique transaction ID
      const transactionId = new ObjectId().toString();
      const initiateData = {
        store_id: process.env.SSL_STORE_ID,
        store_passwd: process.env.SSL_STORE_PASSWORD,
        total_amount: paymentInfo.amount, // TODO:Dynamically set amount
        currency: "BDT",
        tran_id: transactionId,
        success_url: `${process.env.BACKEND_URL}/success-payment`,
        fail_url: `${process.env.BACKEND_URL}/fail-payment`, // Update fail and cancel URLs
        cancel_url: `${process.env.BACKEND_URL}/cancel-payment`,
        cus_name: paymentInfo.customerName || "Customer Name",
        cus_email: paymentInfo.customerEmail || "cust@example.com",
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

      // Update the selected appointments with status 'pending'
      const query = {
        _id: {
          $in: paymentInfo.selectedAppointments.map((id) => new ObjectId(id)),
        },
      };
      const update = { $set: { paymentId: transactionId, status: "pending" } };

      const updateResult = await appointmentsCollection.updateMany(
        query,
        update
      );

      if (updateResult) {
        res.send(response.data.GatewayPageURL);
      }
    });

    app.post("/success-payment", async (req, res) => {
      const successData = req.body;

      // Validate payment status
      if (successData.status !== "VALID") {
        return res.status(400).send({ error: "Invalid payment" });
      }

      const transactionId = successData.tran_id;

      const query = {
        paymentId: transactionId,
      };

      const update = {
        $set: {
          paymentId: transactionId,
          status: "paid",
        },
      };

      // Update matching documents in the database
      const updateResult = await appointmentsCollection.updateMany(
        query,
        update
      );

      // Log the update result
      console.log(
        `Matched ${updateResult.matchedCount} documents and updated ${updateResult.modifiedCount} documents.`
      );

      // Send response to the client
      // res.send({
      //   message: "Payment successful and appointments updated",
      //   updateResult,
      // });
      res.redirect(`${process.env.FRONTEND_URL}/success`);
    });
    app.post("/fail-payment", async (req, res) => {
      res.redirect(`${process.env.FRONTEND_URL}/fail`);
    });
    app.post("/cancel-payment", async (req, res) => {
      res.redirect(`${process.env.FRONTEND_URL}/fail`);
    });

    // jwt related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
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
      // if (existingUser || existingProvider) {
      if (existingUser) {
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
    app.get("/user", verifyToken, async (req, res) => {
      const { email } = req.query;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
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
    app.get("/user/provider/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let provider = false;
      if (user) {
        provider = user?.role === "provider";
      }
      res.send({ provider });
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
      const providerInfo = req.body;
      const email = providerInfo.email;

      // Check if the user already exists in providersCollection
      const existingProvider = await providersCollection.findOne({
        email: email,
      });

      if (existingProvider) {
        // If the user is already a provider
        return res.send({ message: "Provider already exists" });
      }

      // Check if the user exists in usersCollection
      const user = await usersCollection.findOne({ email: email });

      if (user) {
        // Update the user's role to "provider"
        const updateRoleResult = await usersCollection.updateOne(
          { email: email },
          { $set: { role: "provider" } }
        );

        if (updateRoleResult.modifiedCount > 0) {
          // Add the user to providersCollection
          const result = await providersCollection.insertOne(providerInfo);
          return res.send({ message: "Provider added successfully", result });
        } else {
          return res.send({ message: "Failed to update user role." });
        }
      } else {
        // If no user was found in usersCollection
        return res.send({
          message: "User does not exist. Check the email address.",
        });
      }
    });
    app.delete("/providers/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await providersCollection.deleteOne(query);
      console.log(id);
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

    app.patch("/appointment", verifyToken, verifyAdmin, async (req, res) => {
      const appointmentUpdateInfo = req.body;
      const filter = { _id: new ObjectId(appointmentUpdateInfo.appointmentId) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          providerEmail: appointmentUpdateInfo.providerEmail,
          status: appointmentUpdateInfo.status,
        },
      };
      const result = await appointmentsCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });

    app.patch(
      "/appointments",
      verifyToken,
      verifyProvider,
      async (req, res) => {
        const appointmentUpdateInfo = req.body;
        const filter = {
          _id: new ObjectId(appointmentUpdateInfo.appointmentId),
        };
        const options = { upsert: true };

        const updateDoc = {
          $set: {
            status: appointmentUpdateInfo.status,
            userMeetingLink: appointmentUpdateInfo.userMeetingLink,
          },
        };

        const result = await appointmentsCollection.updateOne(
          filter,
          updateDoc,
          options
        );

        res.send(result);
      }
    );

    // get all appointment data
    app.get("/AllAppointments", verifyToken, verifyAdmin, async (req, res) => {
      const result = await appointmentsCollection.find().toArray();
      res.send(result);
    });

    app.get("/appointment/:roomId", verifyToken, async (req, res) => {
      const id = req.params.roomId;
      const filter = { _id: new ObjectId(id) };
      const result = await appointmentsCollection.findOne(filter);
      res.send(result);
    });
    // delete single appointment by user
    app.delete("/appointments/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await appointmentsCollection.deleteOne(query);
      res.send(result);
    });
    app.get("/assignAppointments/:email", verifyToken, async (req, res) => {
      const providerEmail = req.params.email;
      const filter = { providerEmail: providerEmail };
      const result = await appointmentsCollection.find(filter).toArray();
      res.send(result);
    });
    // blogs related api
    app.get("/blogs", async (req, res) => {
      const result = await blogsCollection.find().toArray();
      res.send(result);
    });
    app.get("/blog/:_id", async (req, res) => {
      const { _id } = req.params;

      // Use `new ObjectId()` to instantiate it correctly
      const blog = await blogsCollection.findOne({
        _id: new ObjectId(_id),
      });

      if (!blog) {
        return res.status(404).send({ message: "Blog not found" });
      }

      res.send(blog);
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
    // await client.connect();
    // // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
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
