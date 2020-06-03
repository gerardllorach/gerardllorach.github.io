# H+A Fortgeschrittenenprojekt SoSe 2020
 Gerard Llorach

## Project description

### 1) The web-browser
The computational power of the web-browser has been increasing over the years. Some years ago, doing DSP in the browser was not the best option, due to the asynchronous nature of javascript. With the new AudioWorklet (still experimental) one can access each audio block and do signal processing in real-time.

Sadly, there are not many demos working with the AudioWorklet (at least I could not find them). The developer's team in charge has some basic demos here: https://googlechromelabs.github.io/web-audio-samples/audio-worklet/. Most working demos of real-time DSP use the ScriptProcessor node, which is going to be deprecated. The ScriptProcessor runs in the main thread of javascript and it is not in synchrony with the audio processing thread, therefore some its application is limited. A insightful presentation about the AudioWorklet can be found here: https://www.youtube.com/watch?v=g1L4O1smMC0. The Web Audio API can be found here: https://www.w3.org/TR/webaudio/

### 2) Requirements for the AudioWorklet
One of the requirements of the AudioWorklet is that the website has to be provided by an HTTPS server. Initially I created a nodejs server with self-signed certificates to run locally. But I later discovered that github provides HTTPS out of the box and thus switched to this platform to develop the application. Another requirement for the AudioWorklet is that the code has to be written in a different .js file, which is loaded from the main javascript thread.

### 3) Block processing with the AudioWorklet
The AudioWorklet code is called for each new audio block. The audio blocks consist of 128 samples (render quantum), which corresponds to approx. 3ms at 44.1 kHz. The sampling rate is set by default according to the sampling rate of the output device. If sampling rate is manually set, some latency issues could appear as the browser will have to resample the audio output to match the sampling rate of the device. Therefore I prefer to make my application invariant to the sampling rate. More info can be found here: https://www.w3.org/TR/webaudio/#AudioContext-constructors

### 4) Preparing the buffers/frames
In order to calculate the LPC coefficients (or other operations) we need more than 128 samples. Therefore we need to store consecutive audio blocks until we fill a buffer. Once the buffer is filled, we can do operations on a frame basis. I decided to make the buffer size a multiple of 128, this way it is possible to perform the frame operation at the end an audio block. It should be possible to use buffer sizes that are not multiple of 128, but I just found the other way easier. The number of blocks per frame depends on the given frame duration in milliseconds.

```javascript
// Frame duration (e.g., 0.02 s)
const fSize = frameDuration*sampleRate; 
// Make the framesize multiple of 128 (audio render block size)
this._frameSize = 128*Math.round(fSize/128); // Frame duration = this._frameSize/sampleRate;
```

In the current implementation I am using two buffers, which I call odd and pair. The pair buffer should be called "even", it was a translation mistake from catalan. The naming might change in following implementations.

The even buffer stores the frames with even numbering (0,2,4,6,8...) and the odd buffer the odd ones (1,3,5,7,9...). In this implementations, I do 50% overlap, therefore only two buffers are needed. If more than two frames need to be overlapping, this code will not work.

### 5) Filling the buffers with blocks
At each iteration, a new block of 128 samples arrive. This block is assigned to the two buffers, but in a different place of the buffer. Let's put an example with a frame size of 4 blocks and 50% overlap.
```
...
pairBuffer  0 0 0 0
indices     0 1 2 3
oddBuffer       O O O O
indicies        0 1 2 3
...

blockNum    0 1 2 3 4 5 ...
```

Let's look at the block number 2. This block will be assigned to the third block (index 2) of the pairBuffer. At the same time, this block will be assined to the first block of the oddBuffer (index 0). This block is marked with an X in the following section:

```
...
pairBuffer  0 0 X 0
indices     0 1 2 3
oddBuffer       X O O O
indicies        0 1 2 3
...

blockNum    0 1 X 3 4 5 ...
```




