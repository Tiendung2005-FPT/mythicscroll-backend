const express = require('express');
const app = express();
require('dotenv').config()
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs')
const cors = require("cors");
const MONGO_URI = process.env.MONGO_URI;

app.use(express.json());
app.use(cors());

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('Successfully connected to MongoDB Atlas');
    })
    .catch((error) => {
        console.error('Error connecting to MongoDB Atlas:', error.message);
    });

const ChapterSchema = mongoose.Schema({
    mangaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Manga",
        required: true
    },
    chapterNumber: {
        type: String,
        required: true
    },
    title: {
        type: String,
        required: true
    },
    pages: [{
        type: String,
        required: true,
        default: []
    }]
})

const FavoriteSchema = mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    favoriteManga: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Manga",
        required: true
    }]
})

const GenreSchema = mongoose.Schema({
    name: {
        type: String,
        required: true
    }
})

const MangaSchema = mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    genres: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Genre",
        required: true
    }],
    coverUrl: {
        type: String,
        required: true
    },
    status: {
        type: String,
        required: true,
        enum: ["ongoing", "completed"]
    },
    year: {
        type: Number,
        required: true
    },
    uploadedAt: {
        type: Date,
        required: true,
        default: Date.now()
    }
})

const RatingSchema = mongoose.Schema({
    mangaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Manga",
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    }
})

const RoleSchema = mongoose.Schema({
    title: {
        type: String,
        enum: ["Admin", "User"]
    }
})

const UserSchema = mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true,
    },
    role: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Role",
        required: true,
        default: new mongoose.Types.ObjectId("69bf749e38aa2f4410809e51")
    }
})

const Chapter = mongoose.model("Chapter", ChapterSchema);
const Favorite = mongoose.model("Favorite", FavoriteSchema);
const Genre = mongoose.model("Genre", GenreSchema);
const Manga = mongoose.model("Manga", MangaSchema, "manga");
const Rating = mongoose.model("Rating", RatingSchema);
const Role = mongoose.model("Role", RoleSchema);
const User = mongoose.model("User", UserSchema)

app.get('/', async (req, res) => {
    try {
        res.send({ message: 'Welcome to Practical Exam!' });
    } catch (error) {
        res.send({ error: error.message });
    }
});

app.get('/api/manga', async (req, res) => {
    const manga = await Manga.find();

    res.status(200).json(manga)
})

const PORT = process.env.PORT || 9999;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));