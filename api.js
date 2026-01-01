const express = require("express");
const app = express();
const port = 3000;

app.get("/", (req, res) => {
	res.send("Hello World!");
});

// POST route for login
app.post("/login", (req, res) => {
	res.send("Login endpoint");
});

// Start the API
app.listen(port, () => {
	console.log(`API server running at http://localhost:${port}`);
});
