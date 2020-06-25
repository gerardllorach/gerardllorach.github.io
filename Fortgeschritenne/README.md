# H+A Fortgeschrittenenprojekt SoSe 2020
 Gerard Llorach

## Introduction

### The web-browser
The computational power of the web-browser has been increasing over the years. Some years ago, doing DSP in the browser was not the best option, due to the asynchronous nature of javascript. With the new AudioWorklet (still experimental) one can access each audio block and do signal processing in real-time.

Sadly, there are not many demos working with the AudioWorklet (at least I could not find them). The developer's team in charge has some basic demos here: https://googlechromelabs.github.io/web-audio-samples/audio-worklet/. Most working demos of real-time DSP use the ScriptProcessor node, which is going to be deprecated. The ScriptProcessor runs in the main thread of javascript and it is not in synchrony with the audio processing thread, therefore some its application is limited. A insightful presentation about the AudioWorklet can be found here: https://www.youtube.com/watch?v=g1L4O1smMC0. The Web Audio API can be found here: https://www.w3.org/TR/webaudio/

### Requirements for the AudioWorklet
One of the requirements of the AudioWorklet is that the website has to be provided by an HTTPS server. Initially I created a nodejs server with self-signed certificates to run locally. But I later discovered that github provides HTTPS out of the box and thus switched to this platform to develop the application. Another requirement for the AudioWorklet is that the code has to be written in a different .js file, which is loaded from the main javascript thread.

## Chapters
[Chapter 1. Overlap and add](docs/Chapter 1. Overlap and add.md)
Audio blocks, buffers and frames with the Web Audio API.

[Chapter 2. LPC coefficients](docs/Chapter 2. LPC coefficients.md)
The LPC coefficients and the Levinson algorithm.

[Chapter 3. Voice synthesis](docs/Chapter 3. Voice synthesis.md)
Excitation signals, signal energy, pitch detection and filtering.

[Chapter 4. Voice transformations](docs/Chapter 4. Voice transformations.md)
Quantization of lattice coefficients (k) and reversal of lattice coefficients.

[Chapter 5. Web interface](docs/Chapter 5. Web interface.md)
Canvas HTML, microphone input, drag and drop of audio files.

Chapter 6. Visualization
Yet to do


## Todo list
Quantization K's, artifacts appear
Synthesis with white noise
Voice transofrmations


