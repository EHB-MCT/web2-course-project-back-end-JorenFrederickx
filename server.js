const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const port = process.env.PORT || 3000;
app.get("/", (req, res) => {
	res.send("Hello World!");
});

// POST route for login
app.post("/login", (req, res) => {
	// const { username, password } = req.body;
	const username = req.body.username;
	const password = req.body.password;
	console.log("username:", username);
	console.log("password:", password);

	res.send("Login endpoint");
});

// Start the API
app.listen(port, () => {
	console.log(`API server running at http://localhost:${port}`);
});
