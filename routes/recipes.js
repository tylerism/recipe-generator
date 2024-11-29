import express from 'express';
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { slugify } from '../utils.js';
import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

const openai = new OpenAI({
  api_key: process.env.OPENAI_API_KEY,
  project: "proj_LSyw0MpNxcSQx9WjNIKJozQq",
});

const GeneratedRecipe = z.object({
  name: z.string(),
  description: z.string(),
  ingredients: z.array(z.string()),
  instructions: z.array(z.string()),
  image: z.string(),
});

router.get('/', async (req, res) => {
  try {
    const query = 'SELECT name, description, image, slug FROM recipes ORDER BY id DESC';
    const result = await pool.query(query);
    res.render('recipes/index', { recipes: result.rows });
  } catch (error) {
    console.error('Error retrieving recipes:', error);
    res.status(500).send('Failed to retrieve recipes.');
  }
});

router.get('/generate', (req, res) => {
  res.render('recipes/generate', { message: 'Generate a new recipe' });
});

router.post('/generate', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).send('Prompt is required.');
  }

  try {
    const completion = await openai.beta.chat.completions.parse({
      model: "gpt-4o-2024-08-06",
      messages: [
        { role: "system", content: "You are a recipe generator..." },
        { role: "user", content: prompt },
      ],
      response_format: zodResponseFormat(GeneratedRecipe, "recipe"),
    });

    const recipe = completion.choices[0].message.parsed;
    recipe.slug = slugify(recipe.name);

    const query = `
      INSERT INTO recipes (name, description, ingredients, instructions, image, slug)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id;
    `;
    const values = [
      recipe.name,
      recipe.description,
      JSON.stringify(recipe.ingredients),
      JSON.stringify(recipe.instructions),
      recipe.image,
      recipe.slug,
    ];
    const result = await pool.query(query, values);

    console.log(`Recipe inserted with ID: ${result.rows[0].id}`);
    res.json(recipe);
  } catch (error) {
    console.error('Error generating recipe:', error);
    res.status(500).send('Failed to generate recipe.');
  }
});

router.get('/:slug', async (req, res) => {
  const { slug } = req.params;

  try {
    const query = 'SELECT name, description, ingredients, instructions, image FROM recipes WHERE slug = $1';
    const result = await pool.query(query, [slug]);

    if (result.rows.length === 0) {
      return res.status(404).send('Recipe not found');
    }

    res.render('recipes/recipe', { recipe: result.rows[0] });
  } catch (error) {
    console.error('Error fetching recipe:', error);
    res.status(500).send('Internal server error');
  }
});

export default router;
