import express from 'express';
import twig from 'twig';
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import pkg from 'pg'; // Import pg as a default export
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const { Pool } = pkg; // Destructure Pool from pg

const { renderFile } = twig;

const app = express();
const PORT = 3000;

// Set Twig as the templating engine
app.engine('twig', renderFile);
app.set('view engine', 'twig');
app.set('views', './views');

const openai = new OpenAI({
    project: "proj_LSyw0MpNxcSQx9WjNIKJozQq",
    api_key: process.env.OPENAI_API_KEY // Retrieve API key from environment variable
});

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {rejectUnauthorized: false}
});

const GeneratedRecipe = z.object({
  name: z.string(),
  description: z.string(),
  ingredients: z.array(z.string()),
  instructions: z.array(z.string()),
  image: z.string()
});

// Define the "/" route
app.get('/', (req, res) => {
  res.render('index', { message: 'Recipe Generator' });
});

// Define the "generate-recipe" route
app.post('/generate-recipe', async (req, res) => {
    let recipe;

    try {
        const completion = await openai.beta.chat.completions.parse({
            model: "gpt-4o-2024-08-06",
            messages: [
              { role: "system", content: "Create a random recipe with lots of cheese for a Thanksgiving food" },
            ],
            response_format: zodResponseFormat(GeneratedRecipe, "event"),
        });
          
        recipe = completion.choices[0].message.parsed;
        const name = recipe.name;

        const image = await openai.images.generate({ model: "dall-e-3", prompt: name });
        recipe.image = image.data[0].url;

        console.log(recipe);

        // Insert the recipe into the PostgreSQL database
        const query = `
            INSERT INTO recipes (name, description, ingredients, instructions, image)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id;
        `;
        const values = [
            recipe.name,
            recipe.description,
            JSON.stringify(recipe.ingredients), // Store array as JSON
            JSON.stringify(recipe.instructions), // Store array as JSON
            recipe.image
        ];

        const result = await pool.query(query, values);
        console.log(`Recipe inserted with ID: ${result.rows[0].id}`);
    } catch (error) {
        console.error("Error generating recipe or saving to database:", error);
        return res.status(500).json({ error: "Failed to generate recipe." });
    }

    // Return JSON data
    res.json(recipe);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
