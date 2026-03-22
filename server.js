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
    try {
        const filter = {};
        const sortBy = {}

        const keyword = req.query.keyword || "";
        const status = req.query.status || "";
        const sort = req.query.sort || "";

        const genresRaw = req.query.genre;

        const genres = Array.isArray(genresRaw)
            ? genresRaw
            : genresRaw ? [genresRaw] : [];

        const includedGenres = [];
        const excludedGenres = [];

        for (const id of genres) {
            if (id.startsWith("-")) {
                excludedGenres.push(id.slice(1));
            }
            else {
                includedGenres.push(id)
            }
        }

        if (keyword.length > 0) {
            filter.title = { $regex: keyword, $options: "i" }
        }

        if (includedGenres.length > 0) {
            filter.genres = { $all: includedGenres }
        }

        if (excludedGenres.length > 0) {
            filter.genres = {
                ...(filter.genres || {}),
                $nin: excludedGenres
            }
        }

        if (status.length > 0) {
            filter.status = { $eq: status }
        }

        if (sort.length > 0) {
            const direction = sort.startsWith("-") ? -1 : 1;
            const field = sort.startsWith("-") ? sort.slice(1) : sort;

            sortBy[field] = direction;
        }

        const manga = await Manga.find(filter).sort(sortBy);
        res.status(200).json(manga)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

app.get('/api/manga/:mangaId', async (req, res) => {
    try {
        const mangaId = req.params.mangaId;
        if (!mongoose.Types.ObjectId.isValid(mangaId)) {
            return res.status(400).json({ error: `Not a valid id: ${mangaId}` })
        }
        const manga = await Manga.findById(mangaId);
        if (!manga) {
            return res.status(404).json({ error: `Manga not found with id: ${mangaId}` })
        }
        res.status(200).json(manga)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})


const PORT = process.env.PORT || 9999;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));