import express from 'express';
import twig from 'twig';
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import pkg from 'pg'; // Import pg as a default export
import dotenv from 'dotenv';
import { slugify } from './utils.js'; // Import slugify utility (defined below)


// Load environment variables from .env file
dotenv.config();

const { Pool } = pkg; // Destructure Pool from pg

const { renderFile } = twig;

const app = express();
const PORT = process.env.PORT || 5001

// Middleware for parsing JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static('public'));

// Set Twig as the templating engine
app.engine('twig', renderFile);
app.set('view engine', 'twig');
app.set('views', './views');

const openai = new OpenAI({
    project: "proj_1PM5SgAPCCc77fJLSGw9RT4B",
    api_key: process.env.OPENAI_API_KEY // Retrieve API key from environment variable
});

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? {rejectUnauthorized: false} : false
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

    const { prompt } = req.body;

    if (!prompt || prompt.trim() === "") {
        return res.status(400).json({ error: "Prompt is required." });
    }

    let recipe;

    try {
        const completion = await openai.beta.chat.completions.parse({
            model: "gpt-4o-2024-08-06",
            messages: [
                { role: "system", content: "You are a recipe creation assistant." },
                { role: "user", content: prompt }
            ],
            response_format: zodResponseFormat(GeneratedRecipe, "recipe"),
        });
          
        recipe = completion.choices[0].message.parsed;
        const name = recipe.name;
        const slug = slugify(recipe.name);

        const image = await openai.images.generate({ model: "dall-e-3", prompt: 'Professional food photography of ' + name });
        recipe.image = image.data[0].url;

        console.log(recipe);

        // Insert the recipe into the PostgreSQL database
        const query = `
            INSERT INTO recipes (name, description, ingredients, instructions, image, slug)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id;
        `;
        const values = [
            recipe.name,
            recipe.description,
            JSON.stringify(recipe.ingredients), // Store array as JSON
            JSON.stringify(recipe.instructions), // Store array as JSON
            '#',
            slug
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

app.get('/recipes', async (req, res) => {
  try {
      const query = 'SELECT name, description, image, slug FROM recipes ORDER BY id DESC';
      const result = await pool.query(query);

      // Pass recipes to the Twig template
      res.render('recipes', { recipes: result.rows });
  } catch (error) {
      console.error('Error retrieving recipes:', error);
      res.status(500).send('Failed to retrieve recipes.');
  }
});

app.get('/recipes/:slug', async (req, res) => {
  const { slug } = req.params;

  try {
      // Query the database for the recipe with the given slug
      const query = `
          SELECT name, description, ingredients, instructions, image
          FROM recipes
          WHERE slug = $1
      `;
      const result = await pool.query(query, [slug]);

      if (result.rows.length === 0) {
          return res.status(404).send('Recipe not found');
      }

      // Pass the recipe data to the Twig template
      const recipe = result.rows[0];
      res.render('recipe', { recipe });
  } catch (error) {
      console.error('Error fetching recipe:', error);
      res.status(500).send('Internal server error');
  }
});


// Start the server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
