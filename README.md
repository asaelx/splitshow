# splitshow

A CLI tool that serves a full-screen 3-column random media slideshow from a local folder, viewable in any browser.

Each column plays media independently — videos run to the end, images hold for a set duration, then each column picks the next random item. All videos are muted. Background music can be streamed from a YouTube URL.

---

## Supported formats

| Type   | Extensions                                   |
|--------|----------------------------------------------|
| Images | `.jpg` `.jpeg` `.png` `.gif` `.webp` `.avif` |
| Videos | `.mp4` `.webm` `.ogv` `.m4v` `.mov`          |

---

## Requirements

- [Node.js](https://nodejs.org) v16 or higher

---

## Installation

Clone the repository and install globally:

```bash
git clone https://github.com/your-username/splitshow.git
cd splitshow
npm install
npm install -g .
```

---

## Usage

```
splitshow [options]
```

### Options

| Flag | Long form | Description | Default |
|------|-----------|-------------|---------|
| `-d <path>` | `--dir <path>` | Folder containing images/videos | Current directory |
| `-t <seconds>` | `--time <seconds>` | How long each image is displayed | `3` |
| `-p <number>` | `--port <number>` | Port for the local server (auto-increments up to +10 if busy) | `4455` |
| `-m <url>` | `--music <url>` | YouTube URL to stream as background music | Built-in default |
| `-h` | `--help` | Display help | |

### Examples

```bash
# Use the current folder with defaults
splitshow

# Serve from a specific folder
splitshow -d ~/Pictures
splitshow --dir ~/Movies/clips

# Keep each image on screen for 5 seconds
splitshow -d ~/Pictures -t 5
splitshow --dir ~/Pictures --time 5

# Run on a custom port
splitshow -d ~/Pictures -p 8080
splitshow --dir ~/Pictures --port 8080

# Custom background music (full URL or youtu.be short link)
splitshow -d ~/Pictures -m https://www.youtube.com/watch?v=XXXXXXXXXXX
splitshow --dir ~/Pictures --music https://youtu.be/XXXXXXXXXXX

# Combine all options
splitshow -d ~/Pictures -t 4 -p 3000 -m https://www.youtube.com/watch?v=XXXXXXXXXXX
splitshow --dir ~/Pictures --time 4 --port 3000 --music https://youtu.be/XXXXXXXXXXX
```

Once running, open the URL printed in the terminal (default: `http://localhost:4455`) in any browser.

---

## How it works

- The window is split into 3 equal vertical columns.
- The slideshow opens in a **paused state** — press the play button to start.
- Each column plays media independently. When a video ends or an image's timer expires, that column immediately picks the next random item.
- **Click any column** to skip it to the next random media item.
- Media is displayed in cover mode — landscape content is cropped to fill its column vertically.
- All videos are muted. Background music is streamed from YouTube and plays/pauses together with the slideshow.

---

## License

MIT
