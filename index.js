// ==============================
// Required Modules and Imports
// ==============================
const express = require("express"); // Express framework for building the server
const cors = require("cors"); // Middleware for enabling CORS
require("dotenv").config(); // Load environment variables from .env file
const { Resend } = require("resend"); // Resend for sending emails
const bodyParser = require("body-parser"); // Middleware for parsing request bodies
const jwt = require("jsonwebtoken"); // JSON Web Token for authentication
const rateLimit = require("express-rate-limit"); // Middleware for rate limiting
// const { body, validationResult } = require("express-validator"); // Validation middleware (commented out)

// ==============================
// Initialize Express App
// ==============================
const app = express();
const port = process.env.PORT || 8000; // Set the server port

// ==============================
// Middleware Setup
// ==============================
app.use(cors({ origin: "http://localhost:5173" })); // Replace with your frontend URL // Enable CORS for all routes
app.use(express.json()); // Parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded request bodies
app.use(bodyParser.urlencoded({ extended: true })); // Parse URL-encoded bodies (alternative to express.urlencoded)
app.use(bodyParser.json()); // Parse JSON bodies (alternative to express.json)

// ==============================
// Rate Limiting Middleware
// ==============================
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
});
app.use(limiter); // Apply rate limiting to all requests

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
    const appointmentsHistoryCollection = client
      .db("serviceProvider")
      .collection("appointmentsHistory");

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
        total_amount: paymentInfo.amount,
        currency: "BDT",
        tran_id: transactionId,
        success_url: `${process.env.BACKEND_URL}/success-payment`,
        fail_url: `${process.env.BACKEND_URL}/fail-payment`,
        cancel_url: `${process.env.BACKEND_URL}/cancel-payment`,
        cus_name: paymentInfo.customerName || "Customer Name",
        cus_email: paymentInfo.customerEmail || "cust@example.com", // Ensure this is set
        cus_add1: paymentInfo.customerAddress || "Dhaka",
        cus_city: paymentInfo.customerCity || "Dhaka",
        cus_state: paymentInfo.customerState || "Dhaka",
        cus_postcode: paymentInfo.customerPostcode || "1000",
        cus_country: paymentInfo.customerCountry || "Bangladesh",
        cus_phone: paymentInfo.customerPhone || "01711111111",
        shipping_method: "NO",
        product_name: "Appointment",
        product_category: "Appointment",
        product_profile: "non-physical-goods",
        multi_card_name: "mastercard,visacard,amexcard",
        value_a: paymentInfo.valueA || "ref001_A",
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

      // Update the selected appointments with status 'pending' and store the email
      const query = {
        _id: {
          $in: paymentInfo.selectedAppointments.map((id) => new ObjectId(id)),
        },
      };
      const update = {
        $set: {
          paymentId: transactionId,
          status: "pending",
          customerEmail: paymentInfo.customerEmail, // Store the email
        },
      };

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

      // Fetch the appointment(s) associated with this transaction
      const appointment = await appointmentsCollection.findOne({
        paymentId: transactionId,
      });

      if (!appointment) {
        return res.status(404).send({ error: "Appointment not found" });
      }

      const userEmail = appointment.customerEmail; // Retrieve the email from the database

      const query = { paymentId: transactionId };
      const update = { $set: { paymentId: transactionId, status: "paid" } };

      // Update matching documents in the database
      await appointmentsCollection.updateMany(query, update);

      // Send confirmation email
      const resend = new Resend(process.env.RESEND_API_KEY); // Use environment variable
      await resend.emails.send({
        from: "onboarding@resend.dev",
        to: userEmail,
        subject: "Payment Successful",
        html: `<p>Dear customer,</p>
               <p>Your payment of <strong>${successData.currency} ${successData.amount}</strong> was successful.</p>
               <p>Transaction ID: <strong>${transactionId}</strong></p>
        <p>Thank you for your purchase!</p>`,
      });

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
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);

      if (existingUser) {
        return res.send({
          message: "User already exists in the database",
          insertedId: null,
        });
      }

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.patch("/user", verifyToken, async (req, res) => {
      const updatedUserInfo = req.body;
      const email = updatedUserInfo.email;

      if (!email) {
        return res
          .status(400)
          .send({ success: false, message: "Email is required" });
      }

      const filter = { email: email };

      const updateDoc = {
        $set: {
          name: updatedUserInfo.name,
          phone: updatedUserInfo.phone,
          photoUrl: updatedUserInfo.photoUrl, // Include photoUrl if needed
        },
      };

      const options = { upsert: true }; // Enable upsert

      try {
        const result = await usersCollection.updateOne(
          filter,
          updateDoc,
          options
        );
        res.send(result);
      } catch (error) {
        res
          .status(500)
          .send({ success: false, message: "Failed to update user" });
      }
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
    app.get("/topProvider", async (req, res) => {
      try {
        const providers = await providersCollection.find({}).toArray();

        // Convert totalReview to a number and filter providers
        const topProviders = providers
          .filter((p) => Number(p.totalReview) >= 10)
          .sort((a, b) => b.rating - a.rating)
          .slice(0, 6);

        if (topProviders.length === 0) {
          return res.status(404).json({ message: "No top providers found." });
        }

        res.json(topProviders);
      } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    app.get("/providers/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await providersCollection.findOne(query);
      res.send(result);
    });
    app.get("/provider/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
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

    // appointments related  apis
    app.post("/appointments", verifyToken, async (req, res) => {
      const appointmentDetails = req.body;

      // Ensure createdAt is stored as a Date object
      appointmentDetails.createdAt = new Date();

      const result = await appointmentsCollection.insertOne(appointmentDetails);
      res.send(result);
    });

    app.get("/appointments", verifyToken, async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await appointmentsCollection
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();
      res.send(result);
    });
    app.get("/appointmentHistory", verifyToken, async (req, res) => {
      const email = req.query.email;
      const query = { email: email };

      const result = await appointmentsHistoryCollection
        .find(query)
        .sort({ completedAt: -1 })
        .toArray();

      // Ensure completedAt is sent as a proper Date object
      result.forEach((appointment) => {
        appointment.completedAt = new Date(appointment.completedAt);
      });

      res.send(result);
    });

    app.patch(
      "/appointmentUpdateByAdmin",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const appointmentUpdateInfo = req.body;
        const filter = {
          _id: new ObjectId(appointmentUpdateInfo.appointmentId),
        };
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
      }
    );

    app.patch(
      "/appointmentUpdateWhenJoinRoom",
      verifyToken,
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

    // complete appointment related api

    app.post(
      "/completeAppointment",
      verifyToken,
      verifyProvider,
      async (req, res) => {
        try {
          const { appointmentId } = req.body;

          if (!appointmentId) {
            return res
              .status(400)
              .json({ error: "Appointment ID is required" });
          }

          const filter = { _id: new ObjectId(appointmentId) };

          // Find the appointment first
          const appointment = await appointmentsCollection.findOne(filter);

          if (!appointment) {
            return res.status(404).json({ error: "Appointment not found" });
          }

          // Extract required fields
          const {
            category,
            email,
            date,
            userId,
            price,
            paymentId,
            providerEmail,
          } = appointment;

          const appointmentHistory = {
            category,
            email,
            date,
            userId,
            price,
            paymentId,
            providerEmail,
            completedAt: new Date(),
          };

          // Move to `appointmentsHistoryCollection`
          const insertResult = await appointmentsHistoryCollection.insertOne(
            appointmentHistory
          );

          if (!insertResult.acknowledged) {
            return res
              .status(500)
              .json({ error: "Failed to save history record" });
          }

          // Delete from `appointmentsCollection`
          const deleteResult = await appointmentsCollection.deleteOne(filter);

          res.status(200).json({
            message: "Appointment completed successfully",
            insertedId: insertResult.insertedId,
            deletedCount: deleteResult.deletedCount,
          });
        } catch (error) {
          res
            .status(500)
            .json({ error: "Internal Server Error", details: error.message });
        }
      }
    );

    // provider complete appointment related api
    app.get(
      "/myAppointCompleteHistory",
      verifyToken,
      verifyProvider,
      async (req, res) => {
        try {
          const { email } = req.query; // Get email from query parameters

          if (!email) {
            return res.status(400).json({ error: "Email is required" });
          }

          const query = { providerEmail: email };
          const result = await appointmentsHistoryCollection
            .find(query)
            .sort({ completedAt: -1 })
            .toArray();

          res.send(result);
        } catch (error) {
          res
            .status(500)
            .json({ error: "Internal Server Error", details: error.message });
        }
      }
    );

    // get all appointment data
    app.get("/AllAppointments", verifyToken, verifyAdmin, async (req, res) => {
      const result = await appointmentsCollection
        .find()
        .sort({ createdAt: -1 })
        .toArray();
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
      const result = await appointmentsCollection.deleteOne(filter);
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
      try {
        const result = await blogsCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        console.error("Error fetching blogs:", error);
        res
          .status(500)
          .json({ success: false, message: "Internal Server Error" });
      }
    });

    app.post("/blogs", verifyToken, verifyProvider, async (req, res) => {
      try {
        const data = req.body;
        const dateObj = new Date();

        const timeOptions = {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        };
        const formattedTime = dateObj.toLocaleTimeString("en-US", timeOptions);

        const dateOptions = {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        };
        const formattedDate = dateObj.toLocaleDateString("en-CA", dateOptions);

        const email = data.authorEmail;

        // Get author details using email
        const authorINFO = await providersCollection.findOne({ email: email });

        if (!authorINFO) {
          return res.status(404).send({ message: "Author not found" });
        }

        const newBlog = {
          title: data.title,
          content: data.content,
          authorEmail: email,
          img: data.img,
          category: authorINFO.category,
          time: formattedTime,
          date: formattedDate,
          totalView: data.totalView || 0,
          rating: data.rating || 0,
          totalRating: data.totalRating || 0,
          createdAt: dateObj,
        };

        // Insert into MongoDB
        const result = await blogsCollection.insertOne(newBlog);
        res.send(result);
      } catch (error) {
        console.error("Error adding blog:", error);
        res
          .status(500)
          .json({ success: false, message: "Internal Server Error" });
      }
    });

    app.get(
      "/myBlogs/:email",
      verifyToken,
      verifyProvider,
      async (req, res) => {
        const { email } = req.params;

        if (!email) {
          return res.status(400).send({ message: "Email is required" });
        }

        const blogs = await blogsCollection
          .find({ authorEmail: email })
          .sort({ createdAt: -1 })
          .toArray();
        res.send(blogs);
      }
    );

    app.get("/blog/:_id", async (req, res) => {
      try {
        const { _id } = req.params;

        if (!_id) {
          return res.status(400).json({ message: "Invalid blog ID format" });
        }

        const query = { _id: new ObjectId(_id) };

        const blog = await blogsCollection.findOne(query);

        if (!blog) {
          return res.status(404).json({ message: "Blog not found" });
        }

        res.json(blog);
      } catch (error) {
        console.error("Error fetching blog:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    app.get("/providersInBlog/:email", async (req, res) => {
      try {
        const { email } = req.params;
        const query = { email: email };

        const result = await providersCollection.findOne(query, {
          projection: { name: 1, userImg: 1 },
        });

        if (!result) {
          return res.status(404).json({ message: "Author not found" });
        }

        res.json(result);
      } catch (error) {
        console.error("Error fetching provider:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    // reviews related apis

    app.get("/reviews", async (req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    });

    app.post("/contacts", verifyToken, async (req, res) => {
      const contactSMSInfo = req.body;

      const data = {
        ...contactSMSInfo,
        createdAt: new Date(),
      };

      // Insert the contact data with createdAt
      const result = await contactsCollection.insertOne(data);

      res.send(result);
    });

    app.get("/contacts/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };

      const result = await contactsCollection
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();

      res.send(result);
    });

    app.get("/contacts", verifyToken, verifyAdmin, async (req, res) => {
      const result = await contactsCollection
        .find({})
        .sort({ createdAt: -1 })
        .toArray();
      res.send(result);
    });
    app.patch("/contactReplay", verifyToken, verifyAdmin, async (req, res) => {
      const contactInfo = req.body;
      const _id = contactInfo._id;
      const updateDoc = {
        $set: {
          replay: contactInfo.replay,
        },
      };
      const query = { _id: new ObjectId(_id) };
      const options = { upsert: true };
      const result = await contactsCollection.updateOne(
        query,
        updateDoc,
        options
      );
      res.send(result);
    });

    // states
    app.get("/adminStats", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const userCount = await usersCollection.estimatedDocumentCount();
        const appointmentHistoryCount =
          await appointmentsHistoryCollection.estimatedDocumentCount();
        const providerCount =
          await providersCollection.estimatedDocumentCount();
        const result = await appointmentsHistoryCollection
          .aggregate([
            {
              $project: {
                price: { $toDouble: "$price" },
              },
            },
            {
              $group: {
                _id: null,
                totalRevenue: {
                  $sum: "$price",
                },
              },
            },
          ])
          .toArray();

        const revenue = result.length > 0 ? result[0].totalRevenue : 0;

        res.send({
          userCount,
          appointmentHistoryCount,
          providerCount,
          revenue,
        });
      } catch (error) {
        res.status(500).send({ message: "Server Error", error });
      }
    });

    app.get("/appointmentState", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const [appointmentResult, historyResult] = await Promise.all([
          appointmentsCollection
            .aggregate([
              {
                $group: {
                  _id: "$category",
                  totalAppointments: { $sum: 1 },
                },
              },
            ])
            .toArray(),
          appointmentsHistoryCollection
            .aggregate([
              {
                $group: {
                  _id: "$category",
                  totalAppointments: { $sum: 1 },
                  totalRevenue: { $sum: "$price" },
                },
              },
            ])
            .toArray(),
        ]);

        res.json({ appointmentResult, historyResult });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
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
