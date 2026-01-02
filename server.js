"use strict";

const express = require("express");
const cors = require("cors");
require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();

const allowedOrigins = [
	"http://127.0.0.1:5500",
	"http://localhost:5500",
	"http://127.0.0.1:3000",
	"http://localhost:3000",
];

app.use(
	cors({
		origin: (origin, cb) => {
			if (!origin) return cb(null, true);
			if (allowedOrigins.includes(origin)) return cb(null, true);
			return cb(new Error("Not allowed by CORS: " + origin));
		},
		methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowedHeaders: ["Content-Type", "Authorization"],
	})
);

app.options("*", cors());

app.use(express.json());

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

app.post("/auth/register", async (req, res) => {
	try {
		const { email, password, name, profilePictureUrl } = req.body;

		if (!email || !password) {
			return res.status(400).json({ error: "email and password are required" });
		}

		const normalizedEmail = String(email).toLowerCase().trim();

		const existing = await User.findOne({ email: normalizedEmail });
		if (existing) {
			return res.status(409).json({ error: "email already exists" });
		}

		const passwordHash = await bcrypt.hash(password, 10);

		const user = await User.create({
			email: normalizedEmail,
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

app.post("/auth/login", async (req, res) => {
	try {
		const { email, password } = req.body;

		if (!email || !password) {
			return res.status(400).json({ error: "email and password are required" });
		}

		const normalizedEmail = String(email).toLowerCase().trim();

		const user = await User.findOne({ email: normalizedEmail });
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

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

const stAntonCache = { ts: 0, payload: null };
const CACHE_TTL_MS = 5 * 60 * 1000;

async function overpassRequest(query) {
	for (let attempt = 1; attempt <= 2; attempt++) {
		try {
			const r = await fetch(OVERPASS_URL, {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
					Accept: "application/json",
					"User-Agent": "apres-ski-finder/1.0",
				},
				body: "data=" + encodeURIComponent(query),
			});

			if (!r.ok) {
				const text = await r.text();
				if (attempt === 2) {
					throw new Error(text);
				}
				await new Promise((res) => setTimeout(res, 800));
				continue;
			}

			return await r.json();
		} catch (e) {
			if (attempt === 2) throw e;
			await new Promise((res) => setTimeout(res, 800));
		}
	}
}

app.get("/api/apres-ski/st-anton", async (req, res) => {
	try {
		// serve cache if fresh
		if (stAntonCache.payload && Date.now() - stAntonCache.ts < CACHE_TTL_MS) {
			return res.json(stAntonCache.payload);
		}

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

		const data = await overpassRequest(query);

		const places = (data.elements || []).map((el) => ({
			id: el.id,
			type: el.tags?.amenity || "unknown",
			name: el.tags?.name || "(no name)",
			lat: el.lat ?? el.center?.lat ?? null,
			lon: el.lon ?? el.center?.lon ?? null,
			website: el.tags?.website || el.tags?.contact_website || null,
		}));

		const payload = { count: places.length, places };

		stAntonCache.ts = Date.now();
		stAntonCache.payload = payload;

		return res.json(payload);
	} catch (err) {
		return res.status(500).json({
			error: "Overpass failed",
			details: err.message,
		});
	}
});

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
