import express from 'express';
import twig from 'twig';
import dotenv from 'dotenv';
import questionsRoutes from './routes/questions.js';
import recipesRoutes from './routes/recipes.js';



// Load environment variables from .env file
dotenv.config();

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

// Route imports
app.use('/questions', questionsRoutes);
app.use('/recipes', recipesRoutes);

// Define the "/" route
app.get('/', (req, res) => {
res.render('questions', { message: 'Question Generator' });
});


// Start the server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
