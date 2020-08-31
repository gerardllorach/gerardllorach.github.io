## Introduction

### The web-browser
The computational power of the web-browser has been increasing over the years. Some years ago, doing DSP in the browser was not the best option, due to the asynchronous nature of javascript. With the new AudioWorklet (still experimental) one can access each audio block and do signal processing in real-time.

Sadly, there are not many demos working with the AudioWorklet (at least we could not find them). The developer's team in charge has some basic demos here: https://googlechromelabs.github.io/web-audio-samples/audio-worklet/. Most working demos of real-time DSP use the ScriptProcessor node, which is going to be deprecated. The ScriptProcessor runs in the main thread of javascript and it is not in synchrony with the audio processing thread, therefore some of its application is limited. An insightful presentation about the AudioWorklet can be found here: https://www.youtube.com/watch?v=g1L4O1smMC0. The Web Audio API can be found here: https://www.w3.org/TR/webaudio/

### Requirements for the AudioWorklet
One of the requirements of the AudioWorklet is that the website has to be provided by an HTTPS server. Initially we created a nodejs server with self-signed certificates to run locally. But we later discovered that github provides HTTPS out of the box and thus switched to this platform to develop the application. Another requirement for the AudioWorklet is that the code has to be written in a different .js file, which is loaded from the main javascript thread.

### Structure of the software 
The general visual composition is defined in `index.html`, where individual interactive elements are defined. Their functionality is largely implemented in `script.js`, as well as routines for visualization of parts of the processing scheme. Computations required for linear prediction analysis and synthesis of speech are contained within `LPC.js`. This is utilized in an instance of the AudioWorklet implementation of `vocoder.js`, which makes use of the WebAudio interface. Some voice transformations require resampling operations, which are contained in `resample.js`.
The speech processing is carried out on a frame basis in an overlap-add scheme.
