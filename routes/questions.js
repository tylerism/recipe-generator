import express from 'express';
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import pkg from 'pg';
import dotenv from 'dotenv';
import crypto from 'crypto';

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

// Predefined questions array
const questions = [
  {
    question: 'If two average-sized men were standing naked facing each other with their erect penises touching at the tips, how far in inches would their noses be from each other?',
    numerical_answer: '8 inches.',
    extra_answer_information: 'In 2018, Brandon and Brett Bagwell set the world record for longest time touching penis tips while making eye contact. An astonishing 24 hours!'
  },
  {
    question: 'How many average male testicles can fit inside of a standard-sized vagina?',
    numerical_answer: '32 testicles.',
    extra_answer_information: 'Although this number can vary depending on age and looseness.'
  },
  {
    question: 'How many Cleveland steamers does the average American receive on a daily basis?',
    numerical_answer: '3 Cleveland steamers.',
    extra_answer_information: 'This number typically seems exaggerated because people are shy to admit it, but it is accurate!'
  },
  {
    question: 'If you were to take the skin from an average-sized ballsack, how many ballsacks would it take to cover a basketball?',
    numerical_answer: '23 average-sized scrotums.',
    extra_answer_information: 'If you could stretch scrotal skin elastically, you might get by with fewer. But let\'s not test that theory.'
  },
  {
    question: 'How many sperm cells can fit in a shot glass?',
    numerical_answer: '983 billion sperm cells.',
    extra_answer_information: 'This number is 10 times more than the total number of stars in the Milky Way galaxy! Who knew a shot glass could hold so much potential?'
  }
];

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
    // Check feature flag
    const flag_query = 'SELECT * FROM feature_flags WHERE name = $1';
    const flag_values = ['goofy_questions'];
    const { rows } = await pool.query(flag_query, flag_values);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Feature flag not found' });
    }

    const feature_flag_value = rows[0].value;

    let question;

    if (feature_flag_value) {
      let attempts = 0;
      const maxAttempts = 5;

      while (attempts < maxAttempts) {
        // Pick a random question from the array
        const randomIndex = Math.floor(Math.random() * questions.length);
        question = questions[randomIndex];

        // Generate a unique ID for the question
        const question_id = crypto.createHash('sha256').update(question.question).digest('hex');

        // Check if the question_id exists in the database
        const checkQuery = 'SELECT * FROM questions WHERE question_id = $1';
        const checkResult = await pool.query(checkQuery, [question_id]);

        if (checkResult.rows.length === 0) {
          // Question ID not found, return this question
          question.question_id = question_id; // Attach the ID to the question
          break;
        }

        // If question_id exists, increment attempts
        attempts++;
      }

      // If maxAttempts reached, pick any random question
      if (attempts === maxAttempts) {
        const fallbackIndex = Math.floor(Math.random() * questions.length);
        question = questions[fallbackIndex];
        question.question_id = crypto.createHash('sha256').update(question.question).digest('hex');
      }

      // Return the question without inserting it into the database
      await sleep(2000);
      return res.json(question);
    } else {
      // Generate a question using OpenAI if feature flag is not enabled
      const message_content_system = "You are a master of trivia and know everything. I need you to give me questions that have a numerical answer. They should be challenging";
      const message_content_user = "Give me a new question";

      const completion = await openai.beta.chat.completions.parse({
        model: "gpt-4o-2024-08-06",
        messages: [
          { role: "system", content: message_content_system },
          { role: "user", content: message_content_user },
        ],
        response_format: zodResponseFormat(GeneratedQuestion, "question"),
      });

      question = completion.choices[0].message.parsed;
      question.question_id = crypto.createHash('sha256').update(question.question).digest('hex');

      // Check if the question_id exists in the database
      const checkQuery = 'SELECT * FROM questions WHERE question_id = $1';
      const checkResult = await pool.query(checkQuery, [question.question_id]);

      if (checkResult.rows.length > 0) {
        // If question_id exists, return the question without inserting
        return res.json(question);
      }

      // Insert the question into the database
      const insertQuery = `
        INSERT INTO questions (question_id, question_text, answer_text)
        VALUES ($1, $2, $3)
        RETURNING id;
      `;
      const insertValues = [question.question_id, question.question, question.numerical_answer];
      const result = await pool.query(insertQuery, insertValues);

      console.log(`Question inserted with ID: ${result.rows[0].id}`);
    }

    res.json({ ...question, question_id: question.question_id });
  } catch (error) {
    console.error('Error generating question:', error);
    res.status(500).send('Failed to generate question.');
  }
});

export default router;
