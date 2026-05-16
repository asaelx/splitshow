#!/usr/bin/env node
const { program } = require('commander');
const path = require('path');
const startServer = require('../src/server');

program
  .name('splitshow')
  .description('Serve a 3-column random media slideshow from a local folder in your browser.')
  .option('-d, --dir <path>',     'folder containing images/videos', process.cwd())
  .option('-t, --time <seconds>', 'how long each image is displayed, in seconds', '3')
  .option('-p, --port <number>',  'port for the local server; auto-increments up to +10 if busy', '4455')
  .option('-m, --music <url>',    'YouTube URL to use as background music', 'https://www.youtube.com/watch?v=X4w6vHtVGA4')
  .addHelpText('after', `
Examples:
  $ splitshow                                   use current folder, 3 s images, port 4455
  $ splitshow -d ~/Pictures                     serve from ~/Pictures
  $ splitshow --dir ~/Movies/clips              serve from ~/Movies/clips
  $ splitshow -d ~/Pictures -t 5               images hold for 5 seconds
  $ splitshow --dir ~/Pictures --time 10        images hold for 10 seconds
  $ splitshow -d ~/Pictures -p 8080             run on port 8080
  $ splitshow --dir ~/Pictures --port 8080      run on port 8080
  $ splitshow -d ~/Pictures -m https://www.youtube.com/watch?v=XXXXXXXXXXX
  $ splitshow --dir ~/Pictures --music https://www.youtube.com/watch?v=XXXXXXXXXXX
  $ splitshow -d ~/Pictures -t 4 -p 3000        full example with all options
  $ splitshow --dir ~/Pictures --time 4 --port 3000
`);

program.parse();

const opts = program.opts();

startServer({
  mediaDir: path.resolve(opts.dir),
  imageDuration: Math.max(1, parseInt(opts.time, 10) || 3),
  preferredPort: parseInt(opts.port, 10) || 4455,
  musicUrl: opts.music,
});
