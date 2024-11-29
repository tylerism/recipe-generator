import express from 'express';
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
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
});

const GeneratedQuestion = z.object({
  question: z.string(),
  numerical_answer: z.string(),
  extra_answer_information: z.string(),
});

router.get('/', async (req, res) => {
  try {
    const query = 'SELECT question_text, answer_text FROM questions ORDER BY id DESC';
    const result = await pool.query(query);
    res.render('questions/index', { questions: result.rows });
  } catch (error) {
    console.error('Error retrieving questions:', error);
    res.status(500).send('Failed to retrieve questions.');
  }
});

router.get('/generate', (req, res) => {
  res.render('questions/generate', { message: 'Generate a new question' });
});

router.post('/generate', async (req, res) => {
  try {
    const completion = await openai.beta.chat.completions.parse({
      model: "gpt-4o-2024-08-06",
      messages: [
        { role: "system", content: "You are a question generator..." },
        { role: "user", content: "Give me a new question" },
      ],
      response_format: zodResponseFormat(GeneratedQuestion, "question"),
    });

    const question = completion.choices[0].message.parsed;

    const query = `
      INSERT INTO questions (question_text, answer_text)
      VALUES ($1, $2)
      RETURNING id;
    `;
    const values = [question.question, question.numerical_answer];
    const result = await pool.query(query, values);

    console.log(`Question inserted with ID: ${result.rows[0].id}`);
    res.json(question);
  } catch (error) {
    console.error('Error generating question:', error);
    res.status(500).send('Failed to generate question.');
  }
});

export default router;
