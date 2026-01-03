"use strict";

const express = require("express");
const cors = require("cors");
require("dotenv").config();
const User = require("./models/User");

const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();

const allowedOrigins = [
	"http://127.0.0.1:5500",
	"http://localhost:5500",
	"http://127.0.0.1:3000",
	"http://localhost:3000",
	"https://ideal-adventure-6lwww7m.pages.github.io",
	"https://github.com/EHB-MCT/web2-course-project-front-end-JorenFrederickx",
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
app.put("/me", auth, async (req, res) => {
	try {
		const userId = req.user.userId;

		const { email, name, profilePictureUrl, password, currentPassword } =
			req.body;

		const updates = {};

		if (email !== undefined) {
			const normalizedEmail = String(email).toLowerCase().trim();
			if (!normalizedEmail)
				return res.status(400).json({ error: "email cannot be empty" });

			const existing = await User.findOne({ email: normalizedEmail });
			if (existing && existing._id.toString() !== userId) {
				return res.status(409).json({ error: "email already exists" });
			}

			updates.email = normalizedEmail;
		}

		if (name !== undefined) updates.name = String(name).trim();
		if (profilePictureUrl !== undefined)
			updates.profilePictureUrl = String(profilePictureUrl).trim();

		if (password !== undefined) {
			const newPassword = String(password);
			if (newPassword.length < 6) {
				return res
					.status(400)
					.json({ error: "password must be at least 6 characters" });
			}

			const user = await User.findById(userId);
			if (!user) return res.status(404).json({ error: "user not found" });

			if (!currentPassword) {
				return res
					.status(400)
					.json({ error: "currentPassword is required to change password" });
			}

			const ok = await bcrypt.compare(
				String(currentPassword),
				user.passwordHash
			);
			if (!ok)
				return res.status(401).json({ error: "current password is incorrect" });

			updates.passwordHash = await bcrypt.hash(newPassword, 10);
		}

		const updated = await User.findByIdAndUpdate(userId, updates, {
			new: true,
		});
		if (!updated) return res.status(404).json({ error: "user not found" });

		return res.json({
			ok: true,
			user: {
				id: updated._id,
				email: updated.email,
				name: updated.name,
				profilePictureUrl: updated.profilePictureUrl,
			},
		});
	} catch (err) {
		return res.status(500).json({ error: err.message });
	}
});

app.delete("/me", auth, async (req, res) => {
	try {
		const userId = req.user.userId;
		const deleted = await User.findByIdAndDelete(userId);
		if (!deleted) return res.status(404).json({ error: "user not found" });

		return res.json({ ok: true, message: "account deleted" });
	} catch (err) {
		return res.status(500).json({ error: err.message });
	}
});

//register
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

//login
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
const ischglCache = { ts: 0, payload: null };
const saalbachCache = { ts: 0, payload: null };

const zermattCache = { ts: 0, payload: null };
const verbierCache = { ts: 0, payload: null };
const stMoritzCache = { ts: 0, payload: null };

const valThorensCache = { ts: 0, payload: null };
const chamonixCache = { ts: 0, payload: null };
const courchevelCache = { ts: 0, payload: null };
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
//all ski resort eindpoints individually (because the api crashed if I do them all at once)
//austrian
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

app.get("/api/apres-ski/ischgl", async (req, res) => {
	try {
		if (ischglCache.payload && Date.now() - ischglCache.ts < CACHE_TTL_MS) {
			return res.json(ischglCache.payload);
		}

		const query = `
[out:json][timeout:25];
(
  node["amenity"="bar"](around:2200,47.0127,10.2919);
  node["amenity"="pub"](around:2200,47.0127,10.2919);
  node["amenity"="nightclub"](around:2200,47.0127,10.2919);
  way["amenity"="bar"](around:2200,47.0127,10.2919);
  way["amenity"="pub"](around:2200,47.0127,10.2919);
  way["amenity"="nightclub"](around:2200,47.0127,10.2919);
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
		ischglCache.ts = Date.now();
		ischglCache.payload = payload;

		res.json(payload);
	} catch (err) {
		res.status(500).json({ error: "Overpass failed", details: err.message });
	}
});

app.get("/api/apres-ski/saalbach", async (req, res) => {
	try {
		if (saalbachCache.payload && Date.now() - saalbachCache.ts < CACHE_TTL_MS) {
			return res.json(saalbachCache.payload);
		}

		const query = `
[out:json][timeout:25];
(
  node["amenity"="bar"](around:2200,47.3916,12.6389);
  node["amenity"="pub"](around:2200,47.3916,12.6389);
  node["amenity"="nightclub"](around:2200,47.3916,12.6389);
  way["amenity"="bar"](around:2200,47.3916,12.6389);
  way["amenity"="pub"](around:2200,47.3916,12.6389);
  way["amenity"="nightclub"](around:2200,47.3916,12.6389);
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
		saalbachCache.ts = Date.now();
		saalbachCache.payload = payload;

		res.json(payload);
	} catch (err) {
		res.status(500).json({ error: "Overpass failed", details: err.message });
	}
});

//swiss
app.get("/api/apres-ski/zermatt", async (req, res) => {
	try {
		if (zermattCache.payload && Date.now() - zermattCache.ts < CACHE_TTL_MS) {
			return res.json(zermattCache.payload);
		}

		const query = `
[out:json][timeout:25];
(
  node["amenity"="bar"](around:2200,46.0207,7.7491);
  node["amenity"="pub"](around:2200,46.0207,7.7491);
  node["amenity"="nightclub"](around:2200,46.0207,7.7491);
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
		zermattCache.ts = Date.now();
		zermattCache.payload = payload;

		res.json(payload);
	} catch (err) {
		res.status(500).json({ error: "Overpass failed", details: err.message });
	}
});

app.get("/api/apres-ski/verbier", async (req, res) => {
	try {
		if (verbierCache.payload && Date.now() - verbierCache.ts < CACHE_TTL_MS) {
			return res.json(verbierCache.payload);
		}

		const query = `
[out:json][timeout:25];
(
  node["amenity"="bar"](around:2200,46.0961,7.2267);
  node["amenity"="pub"](around:2200,46.0961,7.2267);
  node["amenity"="nightclub"](around:2200,46.0961,7.2267);
  way["amenity"="bar"](around:2200,46.0961,7.2267);
  way["amenity"="pub"](around:2200,46.0961,7.2267);
  way["amenity"="nightclub"](around:2200,46.0961,7.2267);
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
		verbierCache.ts = Date.now();
		verbierCache.payload = payload;

		res.json(payload);
	} catch (err) {
		res.status(500).json({ error: "Overpass failed", details: err.message });
	}
});

app.get("/api/apres-ski/st-moritz", async (req, res) => {
	try {
		if (stMoritzCache.payload && Date.now() - stMoritzCache.ts < CACHE_TTL_MS) {
			return res.json(stMoritzCache.payload);
		}

		const query = `
[out:json][timeout:25];
(
  node["amenity"="bar"](around:2200,46.4983,9.8390);
  node["amenity"="pub"](around:2200,46.4983,9.8390);
  node["amenity"="nightclub"](around:2200,46.4983,9.8390);
  way["amenity"="bar"](around:2200,46.4983,9.8390);
  way["amenity"="pub"](around:2200,46.4983,9.8390);
  way["amenity"="nightclub"](around:2200,46.4983,9.8390);
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
		stMoritzCache.ts = Date.now();
		stMoritzCache.payload = payload;

		res.json(payload);
	} catch (err) {
		res.status(500).json({ error: "Overpass failed", details: err.message });
	}
});

//french
app.get("/api/apres-ski/val-thorens", async (req, res) => {
	try {
		if (
			valThorensCache.payload &&
			Date.now() - valThorensCache.ts < CACHE_TTL_MS
		) {
			return res.json(valThorensCache.payload);
		}

		const query = `
[out:json][timeout:25];
(
  node["amenity"="bar"](around:2200,45.2977,6.5803);
  node["amenity"="pub"](around:2200,45.2977,6.5803);
  node["amenity"="nightclub"](around:2200,45.2977,6.5803);
  way["amenity"="bar"](around:2200,45.2977,6.5803);
  way["amenity"="pub"](around:2200,45.2977,6.5803);
  way["amenity"="nightclub"](around:2200,45.2977,6.5803);
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
		valThorensCache.ts = Date.now();
		valThorensCache.payload = payload;

		res.json(payload);
	} catch (err) {
		res.status(500).json({ error: "Overpass failed", details: err.message });
	}
});

app.get("/api/apres-ski/chamonix", async (req, res) => {
	try {
		if (chamonixCache.payload && Date.now() - chamonixCache.ts < CACHE_TTL_MS) {
			return res.json(chamonixCache.payload);
		}

		const query = `
[out:json][timeout:25];
(
  node["amenity"="bar"](around:2200,45.9237,6.8694);
  node["amenity"="pub"](around:2200,45.9237,6.8694);
  node["amenity"="nightclub"](around:2200,45.9237,6.8694);
  way["amenity"="bar"](around:2200,45.9237,6.8694);
  way["amenity"="pub"](around:2200,45.9237,6.8694);
  way["amenity"="nightclub"](around:2200,45.9237,6.8694);
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
		chamonixCache.ts = Date.now();
		chamonixCache.payload = payload;

		res.json(payload);
	} catch (err) {
		res.status(500).json({ error: "Overpass failed", details: err.message });
	}
});

app.get("/api/apres-ski/courchevel", async (req, res) => {
	try {
		if (
			courchevelCache.payload &&
			Date.now() - courchevelCache.ts < CACHE_TTL_MS
		) {
			return res.json(courchevelCache.payload);
		}

		const query = `
[out:json][timeout:25];
(
  node["amenity"="bar"](around:2200,45.4146,6.6345);
  node["amenity"="pub"](around:2200,45.4146,6.6345);
  node["amenity"="nightclub"](around:2200,45.4146,6.6345);
  way["amenity"="bar"](around:2200,45.4146,6.6345);
  way["amenity"="pub"](around:2200,45.4146,6.6345);
  way["amenity"="nightclub"](around:2200,45.4146,6.6345);
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
		courchevelCache.ts = Date.now();
		courchevelCache.payload = payload;

		res.json(payload);
	} catch (err) {
		res.status(500).json({ error: "Overpass failed", details: err.message });
	}
});

//start server and connect to mongodb
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
