const express = require('express');
const app = express();
require('dotenv').config()
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs')
const cors = require("cors");
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const path = require('path');
const fs = require('fs');
const morgan = require('morgan');
const MONGO_URI = process.env.MONGO_URI;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'mythicscroll',
        allowed_formats: ['jpg', 'png', 'jpeg'],
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }
});

app.use(express.json());
app.use(cors());
app.use(morgan('dev'));


mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => {
    console.log("Connected to MongoDB");
}).catch((err) => {
    console.log("Error connecting to MongoDB:", err);
});

const ChapterSchema = mongoose.Schema({
    mangaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Manga",
        required: true
    },
    chapterNumber: {
        type: Number,
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
    }],
    isDisplayed: {
        type: Boolean,
        default: true
    }
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
    },
    isDisplayed: {
        type: Boolean,
        default: true
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

const authMiddleware = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ error: "No token, authorization denied" });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: "Invalid token" });
    }
};

const adminMiddleware = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.userId).populate('role');
        if (!user || !user.role || user.role.title !== 'Admin') {
            return res.status(403).json({ error: "Access denied. Admin role required." });
        }
        next();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

app.get('/', async (req, res) => {
    try {
        res.send({ message: 'Mythic Scroll backend' });
    } catch (error) {
        res.send({ error: error.message });
    }
});

app.get('/api/manga', async (req, res) => {
    try {
        const filter = {};

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

        const toObjectId = (id) => {
            try { return new mongoose.Types.ObjectId(id); } catch (e) { return null; }
        };

        const includedObjectIds = includedGenres.map(toObjectId).filter(id => id);
        const excludedObjectIds = excludedGenres.map(toObjectId).filter(id => id);

        if (includedObjectIds.length > 0) {
            filter.genres = { $all: includedObjectIds }
        }

        if (excludedObjectIds.length > 0) {
            filter.genres = {
                ...(filter.genres || {}),
                $nin: excludedObjectIds
            }
        }

        if (status.length > 0) {
            filter.status = { $eq: status }
        }

        const pipeline = [
            { $match: filter },
            {
                $lookup: {
                    from: "ratings",
                    localField: "_id",
                    foreignField: "mangaId",
                    as: "ratingsInfo"
                }
            },
            {
                $addFields: {
                    ratingCount: { $size: "$ratingsInfo" },
                    averageRating: { $ifNull: [{ $avg: "$ratingsInfo.rating" }, 0] }
                }
            },
            {
                $project: {
                    ratingsInfo: 0
                }
            }
        ];

        if (sort.length > 0) {
            const direction = sort.startsWith("-") ? -1 : 1;
            const field = sort.startsWith("-") ? sort.slice(1) : sort;

            if (field === 'rating') {
                pipeline.push({ $sort: { averageRating: direction, ratingCount: direction } });
            } else {
                pipeline.push({ $sort: { [field]: direction } });
            }
        } else {
            pipeline.push({ $sort: { uploadedAt: -1 } });
        }

        const manga = await Manga.aggregate(pipeline);
        res.status(200).json(manga)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
});

app.get('/api/manga/available', async (req, res) => {
    try {
        const filter = { isDisplayed: true };

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

        const toObjectId = (id) => {
            try { return new mongoose.Types.ObjectId(id); } catch (e) { return null; }
        };

        const includedObjectIds = includedGenres.map(toObjectId).filter(id => id);
        const excludedObjectIds = excludedGenres.map(toObjectId).filter(id => id);

        if (includedObjectIds.length > 0) {
            filter.genres = { $all: includedObjectIds }
        }

        if (excludedObjectIds.length > 0) {
            filter.genres = {
                ...(filter.genres || {}),
                $nin: excludedObjectIds
            }
        }

        if (status.length > 0) {
            filter.status = { $eq: status }
        }

        const pipeline = [
            { $match: filter },
            {
                $lookup: {
                    from: "ratings",
                    localField: "_id",
                    foreignField: "mangaId",
                    as: "ratingsInfo"
                }
            },
            {
                $addFields: {
                    ratingCount: { $size: "$ratingsInfo" },
                    averageRating: { $ifNull: [{ $avg: "$ratingsInfo.rating" }, 0] }
                }
            },
            {
                $project: {
                    ratingsInfo: 0
                }
            }
        ];

        if (sort.length > 0) {
            const direction = sort.startsWith("-") ? -1 : 1;
            const field = sort.startsWith("-") ? sort.slice(1) : sort;

            if (field === 'rating') {
                pipeline.push({ $sort: { averageRating: direction, ratingCount: direction } });
            } else {
                pipeline.push({ $sort: { [field]: direction } });
            }
        } else {
            pipeline.push({ $sort: { uploadedAt: -1 } });
        }

        const manga = await Manga.aggregate(pipeline);
        res.status(200).json(manga)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
});

app.get('/api/manga/:mangaId', async (req, res) => {
    try {
        const mangaId = req.params.mangaId;
        if (!mongoose.Types.ObjectId.isValid(mangaId)) {
            return res.status(400).json({ error: `Not a valid id: ${mangaId}` })
        }

        const token = req.header('Authorization')?.replace('Bearer ', '');
        let userId = null;
        if (token) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                userId = decoded.userId;
            } catch (e) {

            }
        }

        const pipeline = [
            { $match: { _id: new mongoose.Types.ObjectId(mangaId) } },
            {
                $lookup: {
                    from: "ratings",
                    localField: "_id",
                    foreignField: "mangaId",
                    as: "ratingsInfo"
                }
            },
            {
                $addFields: {
                    ratingCount: { $size: "$ratingsInfo" },
                    averageRating: { $ifNull: [{ $avg: "$ratingsInfo.rating" }, 0] }
                }
            },
            {
                $project: {
                    ratingsInfo: 0
                }
            }
        ];

        const manga = await Manga.aggregate(pipeline);

        if (manga.length === 0) {
            return res.status(404).json({ error: `Manga not found with id: ${mangaId}` })
        }

        const result = manga[0];
        if (userId) {
            const userRatingDoc = await Rating.findOne({ mangaId: result._id, userId: new mongoose.Types.ObjectId(userId) });
            if (userRatingDoc) {
                result.userRating = userRatingDoc.rating;
            }
        }

        res.status(200).json(result)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

app.get('/api/manga/available/:mangaId', async (req, res) => {
    try {
        const mangaId = req.params.mangaId;
        if (!mongoose.Types.ObjectId.isValid(mangaId)) {
            return res.status(400).json({ error: `Not a valid id: ${mangaId}` })
        }

        const token = req.header('Authorization')?.replace('Bearer ', '');
        let userId = null;
        if (token) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                userId = decoded.userId;
            } catch (e) { }
        }

        const pipeline = [
            { $match: { _id: new mongoose.Types.ObjectId(mangaId), isDisplayed: true } },
            {
                $lookup: {
                    from: "ratings",
                    localField: "_id",
                    foreignField: "mangaId",
                    as: "ratingsInfo"
                }
            },
            {
                $addFields: {
                    ratingCount: { $size: "$ratingsInfo" },
                    averageRating: { $ifNull: [{ $avg: "$ratingsInfo.rating" }, 0] }
                }
            },
            { $project: { ratingsInfo: 0 } }
        ];

        const manga = await Manga.aggregate(pipeline);

        if (manga.length === 0) {
            return res.status(404).json({ error: `Manga not found or hidden` })
        }

        const result = manga[0];
        if (userId) {
            const userRatingDoc = await Rating.findOne({ mangaId: result._id, userId: new mongoose.Types.ObjectId(userId) });
            if (userRatingDoc) {
                result.userRating = userRatingDoc.rating;
            }
        }

        res.status(200).json(result)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

app.post('/api/manga/:mangaId/rate', authMiddleware, async (req, res) => {
    try {
        const { rating } = req.body;
        const mangaId = req.params.mangaId;
        const userId = req.user.userId;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ error: "Rating must be between 1 and 5" });
        }

        if (!mongoose.Types.ObjectId.isValid(mangaId)) {
            return res.status(400).json({ error: "Invalid manga id" });
        }

        const updatedRating = await Rating.findOneAndUpdate(
            { mangaId, userId },
            { rating },
            { upsert: true, new: true }
        );

        res.status(200).json(updatedRating);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const JWT_SECRET = process.env.JWT_SECRET;

app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ error: "Please provide username, email and password" });
        }

        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(400).json({ error: "User already exists with that email or username" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            username,
            email,
            password: hashedPassword
        });

        await newUser.save();
        const user = await User.findById(newUser._id).populate('role');

        const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: "Please provide email and password" });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        const populatedUser = await User.findById(user._id).populate('role');

        const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
        res.status(200).json({
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: populatedUser.role
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/users/profile', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('-password').populate('role');
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        res.status(200).json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/genres', async (req, res) => {
    try {
        const genres = await Genre.find();
        res.status(200).json(genres);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/genres', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const genre = new Genre(req.body);
        await genre.save();
        res.status(201).json(genre);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/genres/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const genre = await Genre.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!genre) return res.status(404).json({ error: "Genre not found" });
        res.status(200).json(genre);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/genres/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const genre = await Genre.findByIdAndDelete(req.params.id);
        if (!genre) return res.status(404).json({ error: "Genre not found" });
        res.status(200).json({ message: "Genre deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


app.get('/api/chapters/:mangaId', async (req, res) => {
    try {
        const chapters = await Chapter.find({ mangaId: req.params.mangaId }).sort({ chapterNumber: -1 });
        res.status(200).json(chapters);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/chapters/:mangaId/available', async (req, res) => {
    try {
        const chapters = await Chapter.find({ mangaId: req.params.mangaId, isDisplayed: true }).sort({ chapterNumber: -1 });
        res.status(200).json(chapters);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/chapters/single/:chapterId', async (req, res) => {
    try {
        const chapter = await Chapter.findById(req.params.chapterId);
        if (!chapter) {
            return res.status(404).json({ error: "Chapter not found" });
        }
        res.status(200).json(chapter);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/chapters/single/:chapterId/available', async (req, res) => {
    try {
        const chapter = await Chapter.findOne({ _id: req.params.chapterId, isDisplayed: true });
        if (!chapter) {
            return res.status(404).json({ error: "Chapter not found or hidden" });
        }
        res.status(200).json(chapter);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/manga', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const manga = new Manga(req.body);
        await manga.save();
        res.status(201).json(manga);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/manga/:mangaId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const manga = await Manga.findByIdAndUpdate(req.params.mangaId, req.body, { new: true });
        if (!manga) return res.status(404).json({ error: "Manga not found" });
        res.status(200).json(manga);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/chapters', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const chapter = new Chapter(req.body);
        await chapter.save();
        res.status(201).json(chapter);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/chapters/:chapterId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const chapter = await Chapter.findByIdAndUpdate(req.params.chapterId, req.body, { new: true });
        if (!chapter) return res.status(404).json({ error: "Chapter not found" });
        res.status(200).json(chapter);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/upload/single', authMiddleware, adminMiddleware, upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ url: req.file.path });
});

app.post('/api/upload/multiple', authMiddleware, adminMiddleware, upload.array('images', 200), (req, res) => {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
    const urls = req.files.map(f => f.path);
    res.json({ urls: urls });
});


app.use((err, req, res, next) => {
    console.error('SERVER ERROR:', err);
    res.status(500).json({ error: err.message || 'Something went wrong on the server' });
});

const PORT = process.env.PORT || 9999;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));