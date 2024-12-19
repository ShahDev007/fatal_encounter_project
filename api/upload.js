const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
const port = 3001;
const cors = require("cors");
app.use(cors());
// app.use(express.static("build"));

app.use(express.json());

app.post("/api/upload", async (req, res) => {
  const { url } = req.body;
  // console.log("Url is: " + url);

  try {
    // Fetch the content of the provided URL
    // console.log("Fetching URL content...");
    const pageResponse = await axios.get(url);
    const pageContent = pageResponse.data;
    // console.log("URL content fetched successfully");

    // console.log("Calling OpenAI API...");
    // Call the OpenAI API with the content of the webpage
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Extract the following details from the webpage content: Name, Age, Gender, Race, Cause of death, Date of injury resulting in death, Location of injury, Location of death, Agency or agencies involved, Highest level of force and a brief summary of the event",
          },
          {
            role: "user",
            content: `Webpage Content: ${pageContent}`,
          },
        ],
        max_tokens: 1500,
        temperature: 0.5,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    // console.log("OpenAI API call successful");

    // Extracted data from the OpenAI response
    const extractedData = response.data.choices[0].message.content;
    res.status(200).json({ extractedData });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "An error occurred" });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
