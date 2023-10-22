const express = require("express");
const mongoose = require("mongoose");
const fileUpload = require("express-fileupload");
const cloudinary = require("cloudinary").v2;
// const isAuthenticated = require("./middlewares/isAuthenticated");

const app = express();
app.use(express.json());
mongoose.connect("mongodb://localhost:27017/vinted");
cloudinary.config({
  cloud_name: "daexgyjbg",
  api_key: "373457856969771",
  api_secret: "kY6Eisd3XRZWIyEZAAoneQBU3DM",
  secure: true,
});

const uid2 = require("uid2");
const SHA256 = require("crypto-js/sha256");
const encBase64 = require("crypto-js/enc-base64");
// Fonction qui permet de transformer nos fichier qu'on reçoit sous forme de Buffer en base64 afin de pouvoir les upload sur cloudinary
const convertToBase64 = (file) => {
  return `data:${file.mimetype};base64,${file.data.toString("base64")}`;
};

const User = mongoose.model("User", {
  email: String,
  account: {
    username: String,
    avatar: Object, // nous verrons plus tard comment uploader une image
  },
  newsletter: Boolean,
  token: String,
  hash: String,
  salt: String,
});
module.exports = User;

const Offer = mongoose.model("Offer", {
  product_name: String,
  product_description: String,
  product_price: Number,
  product_details: Array,
  product_image: Object,
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
});

app.post("/user/signup", async (req, res) => {
  try {
    const existingMail = await User.findOne({ email: req.body.email });
    if (existingMail) {
      res.status(400).json({ message: "this email already exists" });
    } else if (!req.body.username) {
      return res.status(400).json({ message: "Username is undefined" });
    }

    // const salt = uid2(16);
    console.log("salt:", salt);
    const hash = SHA256(req.body.password + salt).toString(encBase64);
    // console.log("hash:  ", hash);
    const token = uid2(64);
    // console.log("TOKEN  ", token);
    const newUser = new User({
      email: req.body.email,
      account: {
        username: req.body.username,
        avatar: Object, // nous verrons plus tard comment uploader une image
      },
      newsletter: req.body.newsletter,
      token: token,
      hash: hash,
      salt: salt,
    });
    await newUser.save();

    // console.log(newUser);
    res.status(201).json({
      _id: newUser._id,
      token: newUser.token,
      account: newUser.account,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/user/login", async (req, res) => {
  try {
    const existingUser = await User.findOne({ email: req.body.email });
    // console.log("Utilisateur  ", existingUser);
    if (!existingUser) {
      return res.status(400).json({ message: "Unauthorized" });
    }
    // console.log(user);
    const hash2 = SHA256(req.body.password + user.salt).toString(encBase64);
    if (hash2 !== user.hash) {
      res.status(400).json({ message: "Unauthorized" });
    } else
      res.status(201).json({
        _id: existingUser._id,
        token: existingUser.token,
      });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

const isAuthenticated = async (req, res, next) => {
  if (req.headers.authorization) {
    const user = await User.findOne({
      token: req.headers.authorization.replace("Bearer ", ""),
    });

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    } else {
      req.user = user;
      // On crée une clé "user" dans req. La route dans laquelle le middleware est appelé     pourra avoir accès à req.user
      return next();
    }
  } else {
    return res.status(401).json({ error: "Unauthorized" });
  }
};

app.post("/offers/publish", fileUpload(), isAuthenticated, async (req, res) => {
  try {
    // console.log(req.body);
    // console.log(req.user);
    const { title, description, price, condition, city, brand, size, color } =
      req.body;
    const { picture } = req.files;
    // console.log(req.files.picture);
    const readablePicture = convertToBase64(picture);
    // console.log(readablePicture);
    const result = await cloudinary.uploader.upload(readablePicture);
    // console.log(result);
    const newOffer = new Offer({
      product_name: title,
      product_description: description,
      product_price: price,
      product_details: [
        {
          MARQUE: brand,
        },
        {
          TAILLE: size,
        },
        {
          ÉTAT: condition,
        },
        {
          COULEUR: color,
        },
        {
          EMPLACEMENT: city,
        },
      ],
      product_image: result,
      owner: req.user,
    });
    // console.log(newOffer);
    await newOffer.save();
    await newOffer.populate("owner", "account _id");
    res.json(newOffer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/offers", async (req, res) => {
  try {
    // console.log(req.query);
    const { title, priceMin, priceMax, sort, page } = req.query;
    // console.log(title);
    const filter = {};
    if (title) {
      filter.product_name = new RegExp(title, "i");
    }
    if (priceMin) {
      filter.product_price = { $gte: priceMin };
    }
    if (priceMax) {
      if (filter.product_price) {
        filter.product_price.$lte = priceMax;
      } else {
        filter.product_price = { $lte: priceMax };
      }
      filter.product_price = { $lte: priceMax };
    }
    const sortFilter = {};
    if (sort === "price-asc") {
      sortFilter.product_price = "asc";
    } else if (sort === "price-desc") {
      sortFilter.product_price = "desc";
    }
    // console.log(filter);
    let pageToSend = 1;
    if (page) {
      pageToSend = page;
    }
    const skip = (pageToSend - 1) * 5;
    console.log(skip);
    const offers = await Offer.find(filter)
      .sort(sortFilter)
      .limit(5)
      .skip(skip)
      .select("product_name product_price");
    // console.log("CEST LES JEAN:", offers);
    const numberOfOffers = await Offer.countDocuments(filter);
    // console.log(numberOfOffers);

    res.json({ count: numberOfOffers, offers: offers });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/offers/:id", async (req, res) => {
  const offer = await Offer.findById(req.params.id).populate(
    "owner",
    "account _id"
  );
  //   console.log(offer);
  res.json(offer);
});

app.all("*", (req, res) => {
  res.status(404).json({ message: "This route does not exist" });
});
app.listen(3004, () => {
  console.log("Server started");
});
