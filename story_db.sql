-- Create the 'users' table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    firstname VARCHAR(50),
    lastname VARCHAR(50),
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    country VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create the 'story_db' table
CREATE TABLE IF NOT EXISTS stories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    image VARCHAR(255),
    buyImage VARCHAR(255),
    buyLink VARCHAR(255),
    submittedBy INT,
    submittedOn TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    authorFirstName VARCHAR(50),
    authorLastName VARCHAR(50),
    FOREIGN KEY (submittedBy) REFERENCES users(id)
);
