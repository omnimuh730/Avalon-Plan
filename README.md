# AIMS-backend

This is the backend for the AIMS (Automated intelligent-sourcing for jobs) application. It provides a web server that handles real-time communication with the frontend and the browser extension using Socket.io.

## Features

- **Real-time Communication:** Uses Socket.io to provide real-time, bidirectional communication between the frontend, the browser extension, and the backend.
- **Connection Handling:** Handles connection and disconnection events from clients.
- **Message Broadcasting:** Broadcasts messages received from one client to all other connected clients.

## Technologies Used

- **Node.js:** A JavaScript runtime built on Chrome's V8 JavaScript engine.
- **Express:** A minimal and flexible Node.js web application framework.
- **Socket.io:** A library for real-time, bidirectional and event-based communication.
- **Nodemon:** A tool that helps develop Node.js based applications by automatically restarting the node application when file changes in the directory are detected.
- **dotenv:** A zero-dependency module that loads environment variables from a `.env` file into `process.env`.

## Getting Started

To get a local copy up and running, follow these simple steps.

### Prerequisites

- Node.js
- npm or yarn

### Installation

1. Clone the repo
   ```sh
   git clone https://github.com/your_username_/AIMS.git
   ```
2. Navigate to the AIMS-backend directory
   ```sh
   cd AIMS-backend
   ```
3. Install NPM packages
   ```sh
   npm install
   ```
4. Create a `.env` file in the root of the `AIMS-backend` directory and add the following environment variable:
    ```
    PORT=3000
    ```
5. Start the development server
   ```sh
   npm start
   ```

## Project Structure

The project structure is as follows:

- **core/**: Contains the core logic of the application.
  - **test.js**: A test file for the core logic.
- **index.js**: The main entry point of the application.
- **package.json**: The package.json file.
- **yarn.lock**: The yarn.lock file.

## API

The backend exposes a Socket.io API for real-time communication. The API is defined in the `index.js` file.

### Connection

- **Event:** `connection`
- **Description:** Fired when a client connects to the server.

### Disconnection

- **Event:** `disconnect`
- **Description:** Fired when a client disconnects from the server.

### Message Handling

- **Event:** `SOCKET_PROTOCOL.TYPE.CONNECTION`
- **Description:** Fired when a client sends a message to the server. The server then broadcasts the message to all other connected clients.

The communication protocol is defined in the `configs/socket_protocol.js` file.
