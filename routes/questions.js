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
  project: "proj_LSyw0MpNxcSQx9WjNIKJozQq",
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

router.get('/goofy', (req, res) => {
  res.render('questions/goofy', { message: 'GOOFY' });
});

router.get('/goofy_questions', async (req, res) => {
  try {
    // Query the database for the feature flag
    const query = 'SELECT * FROM feature_flags WHERE name = $1';
    const values = ['goofy_questions'];
    const { rows } = await pool.query(query, values);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Feature flag not found' });
    }

    // Return the feature flag as JSON
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching feature flag:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/goofy', async (req, res) => {
  try {
    // Fetch the current value of the feature flag
    const fetchQuery = 'SELECT value FROM feature_flags WHERE name = $1';
    const { rows } = await pool.query(fetchQuery, ['goofy_questions']);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Feature flag not found' });
    }

    const currentValue = rows[0].value;

    // Toggle the value
    const newValue = !currentValue;

    // Update the feature flag in the database
    const updateQuery = 'UPDATE feature_flags SET value = $1 WHERE name = $2 RETURNING value';
    const updateResult = await pool.query(updateQuery, [newValue, 'goofy_questions']);

    // Return the updated value
    res.json({ name: 'goofy_questions', value: updateResult.rows[0].value });
  } catch (error) {
    console.error('Error toggling feature flag:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/generate', async (req, res) => {
  try {

    const flag_query = 'SELECT * FROM feature_flags WHERE name = $1';
    const flag_values = ['goofy_questions'];
    const { rows } = await pool.query(flag_query, flag_values);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Feature flag not found' });
    }

    const feature_flag_value = rows[0].value

    let message_content_system = ''
    let message_content_user = ''
    if (feature_flag_value) {
      message_content_system = "Talk in a babies voice and all your questions are about farts"
      message_content_user = "Give me a new question"
    } else {
      message_content_system = "You are a question generator. You are a question generator. When I ask you give me questions that have numerical answer. The answer can be numerical such as a specific number or a percentage. Do not repeat questions. The questions should be related to popular culture that people would not know the exact answer to."
      message_content_user = "Give me a new question"
    }
    

    const completion = await openai.beta.chat.completions.parse({
      model: "gpt-4o-2024-08-06",
      messages: [
        { role: "system", content: message_content_system},
        { role: "user", content: message_content_user },
      ],
      response_format: zodResponseFormat(GeneratedQuestion, "question"),
    });

    let question = completion.choices[0].message.parsed;

    const query = `
      INSERT INTO questions (question_text, answer_text)
      VALUES ($1, $2)
      RETURNING id;
    `;
    const values = [question.question, question.numerical_answer];
    const result = await pool.query(query, values);

    console.log(`Question inserted with ID: ${result.rows[0].id}`);
    console.log(feature_flag_value)
    if (feature_flag_value) {
      let questions = [
        {
          question: 'If two average sized men were standing naked facing each other with their erect pensis\'s touching at the tips, How far in inches would their noses be from each other',
          numerical_answer: '8 inches.',
          extra_answer_information: 'In 2018 Brandon and Brett Bagwell set the world record for longest time touching penis tips while making eye contact. An astonishing 24 hours!'
        },
        {
          question: 'How many average male testicles can fit inside of a standard sized vagina?',
          numerical_answer: '32 testicles.',
          extra_answer_information: 'Although this number can vary depending on age and looseness'
        },
        {
          question: 'How many Cleveland steamers does that average American recieve on a daily basis?',
          numerical_answer: '3 Cleveland steamers',
          extra_answer_information: 'This number typically seems exaggerated because people are shy to admit, but it is accurate!'
        }
      ]
        question = questions[Math.floor(Math.random() * questions.length)];
      
    }
    res.json(question);
  } catch (error) {
    console.error('Error generating question:', error);
    res.status(500).send('Failed to generate question.');
  }
});

export default router;
