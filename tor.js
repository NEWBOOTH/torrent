const express = require('express');
const app = express();
const ejs = require('ejs');
const path = require('path'); // Import the path module
const { title } = require('process');
const { release } = require('os');
const { log } = require('console');
app.use(express.static('public'))
app.set('view engine', 'ejs');


const itemsPerPage = 50; // Smaller, more reasonable value

app.get('/tor', async (req, res) => {
    const page = parseInt(req.query.page) || 1; // Get page number from query parameters, default to 1

    const url = `https://yts.mx/api/v2/list_movies.json?limit=${itemsPerPage}&page=${page}`; // Use page number

    try {
        const response = await fetch(url, { method: 'GET' });
        if (!response.ok) {
            throw new Error(`YTS API request failed with status ${response.status}`);
        }
        const movieData = await response.json();

        // Data Validation: Check for null and undefined values and if the necessary properties are present
        if (!movieData || !movieData.data || !movieData.data.movies) {
            console.error("Invalid or unexpected data from YTS API.");
            return res.status(500).send("Server Error: Invalid API response");
        }

        const totalItems = movieData.data.movie_count; //Assuming this gives total number of movies in the API
        const totalPages = Math.ceil(totalItems / itemsPerPage);

        //Sanitize movie titles and summaries, and prevent XSS attacks (escapeHtml function provided below).
        const sanitizedMovies = movieData.data.movies.map(movie => ({
            ...movie,
            title: escapeHtml(movie.title),
            summary: escapeHtml(movie.summary)
        }));


        res.render('tor', {
            movies: sanitizedMovies,
            currentPage: page,
            totalPages: totalPages
        });
    } catch (error) {
        console.error('Error fetching movie data:', error);
        res.status(500).send('Server Error');
    }
});


// Helper function to escape HTML entities (prevent XSS attacks)
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ... other code ...

app.get('/tor/:movieId', async (req, res) => {
  const movieId = req.params.movieId;

  const apiUrl = `https://yts.mx/api/v2/movie_details.json?movie_id=${movieId}`;

  try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
          const error = new Error(`YTS API request failed with status ${response.status}`);
        error.status = response.status; // Include status code in the error object for better handling
        throw error; 
      }
      const movieData = await response.json();

      // Validate the API response structure
      if (!movieData || !movieData.data || !movieData.data.movie || !movieData.data.movie.torrents) {
          const error = new Error("Invalid or unexpected data from YTS API.");
        error.status = 400; // Bad request, indicating malformed data
        throw error;
      }

      const movie = movieData.data.movie;
      const torrents = movie.torrents;

      if (torrents && torrents.length > 0) {
        //Sort by quality, then by size (smaller is better) for selecting 'best' torrent.
        const bestTorrent = torrents.sort((a, b) => {
          const qualityDiff = b.quality.localeCompare(a.quality); //Case-insensitive comparison
          return qualityDiff !== 0 ? qualityDiff : a.size - b.size;
        })[0];


          // Sanitize data (using a helper function - see below)
          const sanitizedTorrent = sanitizeTorrentData(bestTorrent);

        res.render('resTor', { torrent: sanitizedTorrent, movieTitle: escapeHtml(movie.title) }); 
      } else {
          res.status(404).send('No torrents found for this movie.');
      }
  } catch (error) {
      console.error('Error fetching movie details:', error);
      res.status(error.status || 500).send(error.message || 'Server Error');
  }
});


//Helper function to sanitize torrent data (prevents XSS)
function sanitizeTorrentData(torrent) {
  return {
      ...torrent,
      quality: escapeHtml(torrent.quality),
      type: escapeHtml(torrent.type),
      size: formatBytes(torrent.size),
      hash: escapeHtml(torrent.hash),
      url: torrent.url //URLs generally don't need escaping
  };
}


//Helper function to format bytes to human-readable format
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}


app.get('/search', async (req, res) => {
  const searchTerm = req.query.query; 

  if (!searchTerm || searchTerm.trim() === '') {
    return res.status(400).send('Please provide a search query.'); //Handle empty query
  }

  const url = `https://yts.mx/api/v2/list_movies.json?limit=20&query_term=${encodeURIComponent(searchTerm)}`; 

  try {
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) {
      const error = new Error(`YTS API request failed with status ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const movieData = await response.json();

    // Validate the API response structure
    if (!movieData || !movieData.data || !movieData.data.movies) {
      const error = new Error("Invalid or unexpected data from YTS API.");
      error.status = 400; 
      throw error;
    }

    const movies = movieData.data.movies;

    //Sanitize data to prevent XSS vulnerabilities
    const sanitizedMovies = movies.map(movie => ({
      ...movie,
      title: escapeHtml(movie.title),
      summary: escapeHtml(movie.summary),
      //Sanitize other potentially unsafe fields here
    }));

    res.render('search', { movies: sanitizedMovies, searchTerm: escapeHtml(searchTerm) }); 
  } catch (error) {
    console.error('Error fetching search results:', error);
    if (error.status) {
      res.status(error.status).send(error.message); 
    } else {
      res.status(500).send('Error fetching search results.');
    }
  }
});


//Helper function to escape HTML (Using EJS's built-in escaping for better performance)
function escapeHtml(unsafe) {
  return ejs.escape(unsafe); 
}



function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


  app.listen(2000, function(){
    console.log('server running on port 2000')
  })