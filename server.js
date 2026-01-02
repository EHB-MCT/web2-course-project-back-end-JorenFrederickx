const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

const allowedOrigins = [
	"http://127.0.0.1:5500",
	"http://localhost:5500",
	"http://127.0.0.1:3000",
	"http://localhost:3000",
	// add your GitHub Pages URL when you have it:
	// "https://<yourusername>.github.io",
	// "https://<yourusername>.github.io/<repo-name>"
];

app.use(
	cors({
		origin: function (origin, cb) {
			if (!origin) return cb(null, true); // Postman / curl
			if (allowedOrigins.includes(origin)) return cb(null, true);
			return cb(new Error("Not allowed by CORS: " + origin));
		},
		methods: ["GET", "POST", "PUT", "DELETE"],
		allowedHeaders: ["Content-Type", "Authorization"],
	})
);

app.use(express.json());

const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

app.get("/api/apres-ski/st-anton", async (req, res) => {
	try {
		const query = `
[out:json][timeout:25];
area["name"="Sankt Anton am Arlberg"]["boundary"="administrative"]->.a;
(
  node["amenity"="bar"](area.a);
  node["amenity"="pub"](area.a);
  node["amenity"="nightclub"](area.a);
  way["amenity"="bar"](area.a);
  way["amenity"="pub"](area.a);
  way["amenity"="nightclub"](area.a);
  relation["amenity"="bar"](area.a);
  relation["amenity"="pub"](area.a);
  relation["amenity"="nightclub"](area.a);
);
out center tags;
`;

		const url = "https://overpass-api.de/api/interpreter";
		const r = await globalThis.fetch(url, {
			method: "POST",
			headers: { "Content-Type": "text/plain" },
			body: query,
		});

		if (!r.ok) {
			const text = await r.text();
			return res.status(500).json({ error: "Overpass failed", details: text });
		}

		const data = await r.json();

		// Clean it up to only what you need
		const places = (data.elements || []).map((el) => ({
			id: el.id,
			type: el.tags?.amenity || "unknown",
			name: el.tags?.name || "(no name)",
			lat: el.lat ?? el.center?.lat,
			lon: el.lon ?? el.center?.lon,
			website: el.tags?.website || el.tags?.contact_website || null,
		}));

		res.json({ count: places.length, places });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;

if (!MONGO_URI) {
	console.error("Missing MONGO_URI in .env");
	process.exit(1);
}
if (!JWT_SECRET) {
	console.error("Missing JWT_SECRET in .env");
	process.exit(1);
}

//mongodb
mongoose
	.connect(MONGO_URI)
	.then(() => {
		console.log("Connected to MongoDB");
		app.listen(PORT, () => {
			console.log(`Server running on port ${PORT}`);
		});
	})
	.catch((err) => {
		console.error("Mongo connection error:", err.message);
		process.exit(1);
	});
const userSchema = new mongoose.Schema(
	{
		email: {
			type: String,
			required: true,
			unique: true,
			lowercase: true,
			trim: true,
		},
		passwordHash: { type: String, required: true },
		name: { type: String, default: "" },
		profilePictureUrl: { type: String, default: "" },
	},
	{ timestamps: true }
);

const User = mongoose.model("User", userSchema);

app.get("/", (req, res) => {
	res.json({ ok: true, message: "API is running" });
});

//register
app.post("/auth/register", async (req, res) => {
	try {
		const { email, password, name, profilePictureUrl } = req.body;

		if (!email || !password) {
			return res.status(400).json({ error: "email and password are required" });
		}

		const existing = await User.findOne({ email: email.toLowerCase() });
		if (existing) {
			return res.status(409).json({ error: "email already exists" });
		}

		const passwordHash = await bcrypt.hash(password, 10);

		const user = await User.create({
			email: email.toLowerCase(),
			passwordHash,
			name: name || "",
			profilePictureUrl: profilePictureUrl || "",
		});

		res.status(201).json({
			id: user._id,
			email: user.email,
			name: user.name,
			profilePictureUrl: user.profilePictureUrl,
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

//login
app.post("/auth/login", async (req, res) => {
	try {
		const { email, password } = req.body;

		if (!email || !password) {
			return res.status(400).json({ error: "email and password are required" });
		}

		const user = await User.findOne({ email: email.toLowerCase() });
		if (!user) return res.status(401).json({ error: "invalid credentials" });

		const ok = await bcrypt.compare(password, user.passwordHash);
		if (!ok) return res.status(401).json({ error: "invalid credentials" });

		const token = jwt.sign(
			{ userId: user._id.toString(), email: user.email },
			JWT_SECRET,
			{ expiresIn: "2h" }
		);

		res.json({ token });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

function auth(req, res, next) {
	const header = req.headers.authorization || "";
	const [type, token] = header.split(" ");

	if (type !== "Bearer" || !token) {
		return res.status(401).json({ error: "missing bearer token" });
	}

	try {
		req.user = jwt.verify(token, JWT_SECRET);
		next();
	} catch {
		return res.status(401).json({ error: "invalid token" });
	}
}

app.get("/me", auth, (req, res) => {
	res.json({ ok: true, user: req.user });
});

app.listen(PORT, () => {
	console.log(`Server running on http://localhost:${PORT}`);
});
