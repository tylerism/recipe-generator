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
    project: "proj_LSyw0MpNxcSQx9WjNIKJozQq",
    api_key: process.env.OPENAI_API_KEY // Retrieve API key from environment variable
});

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? {rejectUnauthorized: false} : false
});

const GeneratedQuestion = z.object({
  question: z.string(),
  numerical_answer: z.string(),
  extra_answer_information: z.string()
});

// Define the "/" route
app.get('/', (req, res) => {
  res.render('question', { message: 'Question Generator' });
});

// Define the "generate-recipe" route
app.get('/generate-question', async (req, res) => {

    let question;

    try {
        const completion = await openai.beta.chat.completions.parse({
            model: "gpt-4o-2024-08-06",
            messages: [
                { role: "system", content: "You are a question generator. When I ask you give me questions that have numerical answer. The answer can be numerical such as a specific number or a percentage. Do not repeat questions. The questions should be difficult questions that people would not know the exact answer to." },
                { role: "user", content: "Give me a new question" }
            ],
            response_format: zodResponseFormat(GeneratedQuestion, "question"),
        });
          
        question = completion.choices[0].message.parsed;
       

        // Insert the recipe into the PostgreSQL database
        const query = `
            INSERT INTO questions (question_text, answer_text)
            VALUES ($1, $2)
            RETURNING id;
        `;
        const values = [
            question.question,
            question.numerical_answer,
        ];

        const result = await pool.query(query, values);
        console.log(`Question inserted with ID: ${result.rows[0].id}`);
    } catch (error) {
        console.error("Error generating question or saving to database:", error);
        return res.status(500).json({ error: "Failed to generate question." });
    }

    // Return JSON data
    res.json(question);
});

app.get('/questions', async (req, res) => {
  try {
      const query = 'SELECT question, answer ORDER BY id DESC';
      const result = await pool.query(query);

      // Pass questions to the Twig template
      res.render('questions', { recipes: result.rows });
  } catch (error) {
      console.error('Error retrieving questions:', error);
      res.status(500).send('Failed to retrieve questions.');
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
