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

```
pairBuffer  0 0 0 0 -- Frame 0
oddBuffer       O O O O -- Frame 1
pairBuffer          0 0 0 0 -- Frame 2
oddBuffer               O O O O -- Frame 3
pairBuffer                  0 0 0 0 -- Frame 4
oddBuffer                       O O O O -- Frame 5
pairBuffer                          0 0 0 0 -- Frame 6
oddBuffer                               O O O O -- Frame 7
...
```

The previous digram can also be understood better when the block numbers (iteration) are shown:

```
pairBuffer  0 1 2 3 -- Frame 0
oddBuffer       2 3 4 5 -- Frame 1
pairBuffer          4 5 6 7 -- Frame 2
oddBuffer               6 7 8 9 -- Frame 3
pairBuffer                  8 9 10 11 -- Frame 4
...
```


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

A buffer is complete when its last 128 samples, i.e. its last block, are filled. In the above example, the pairBuffer would be filled when the blockNum 3 is reached. The oddBuffer would be filled in the blockNum 5. Once the buffer is filled, a full frame is obtained and operations can be done in it.

### 6) Output block: overlap and add routine
In this app, I have an overlap of 50%. For an overlap of 50% or less, only two frames are required. In this code, I have allocated two buffers for the synthesis. These buffers (pairSynthBuffer and oddSynthBuffer) are computed each time a full frame is obtained (see previous section).

The output block of the AudioWorklet has a size of 128 samples, as the input. I use a similar strategy as before, but instead of assigning the incoming block to the buffers, I use the synthesized buffers to compute the output block. I use a Hanning window to add the corresponding blocks of the synthesized buffers. The minimum delay of the system is one frame duration. Currently the application only works well for frames with an even number of blocks.

```
...                
Hanning          /´ ˆ `\
pairSynthBuffer  0 0 X 0
Hanning              /´ ˆ `\
oddSynthBuffer       X O O O
...

```

## Testing interface
The front end contains very simple elements. A canvas (to plot signals); a button to play and pause the audio; a button to activate and deactivate the AudioWorklet processing; and a select list to choose from different audio signals.

### Canvas
In the canvas I plot can plot the frames, blocks and buffers used in the AudioWorklet in real-time. For most signals, this is not very helpful as each frame will have a different shape and I won't be able to see anything in real-time. But for testing purposes, I created a sawtooth wave, where every "tooth" has the size of an AudioWorklet frame, e.g., from 0 to 1 every 1024 samples and so on. With this signal, the frames always have the same shape at every iteration and the wave plot in the canvas is stable. Bear in mind that the sample rate of this signal has to be the same as the Web Audio API, in my case 48 kHz. A sawtooth wave with the size of a block (128 samples) was also used for testing the block size.

```
Sawtooth wave for a frame size of 1024

    /|    /|    /|    /|
  /  |  /  |  /  |  /  |
/    |/    |/    |/    |
0...1024..2048..3072..4096...
```

In order to play different audios in the app, the canvas has a drag a drop function: one can drag and drop and audio file in the web interface. The audio file is then loaded and displayed in the select list. Multiple audio files can also be dragged and dropped. Only ".wav" files are accepted. In my computer the Web Audio API works at 48 kHz, therefore I used audiofiles at 48 kHz to avoid latency issues.


## Vocoder
I implemented the vocoder inside the AudioWorklet, where the overlap and add is also done. 

### Frame rate and blocks
One of the first issues is that the vocoder will work better with a lower sampling frequency, preferably between 8kHz and 16kHz. By default, the sampling frequency of my browser is 48 kHz. But in Chrome, one can specify the sampling frequency of the AudioContext. Nevertheless, if the sampling rate is very low the app can run into problems. It can be that one frame equals to one block. Because I am working with blocks to create frames, in this particular case, there will be no "overlap and add" and some clicks might appear between frames. One possible solution would be to force a minimum of two blocks per frame. The other would be to work on a sample level, which would lead to more delay.

### LPC coefficients
I implemented the LPC algorithm using the Levinson approach. It is described here: "Dutoit, T., 2004, May. Unusual teaching short-cuts to the Levinson and lattice algorithms. In 2004 IEEE International Conference on Acoustics, Speech, and Signal Processing (Vol. 5, pp. V-1029). IEEE."

For the algorithm, first I calculate the autocorrelation of the frame. I only need the autocorrelation values up to the size of the LPC coefficients (M). I used M=12 by default.

```javascript
// Autocorrelation function
autoCorr(buffer, delay){
  let value = 0;
  for (let i = 0; i< buffer.length - delay; i++){
    // Because autocorrelation is symmetric, I use "i + delay", not "i - delay"
    value += buffer[i] * buffer[(i + delay)];
  }
  return value;
}

// Store autocorrelation values in array "phi"
const phi=[];
for (let i = 0; i<M+1; i++){
  phi[i] = this.autoCorr(inBuffer, i);
}
```

Once the autocorrelation values are computed, I can proceed with the Levinson algorithm. The algorithm works in a recursive manner: the coefficients are calculated in a similar way as Pascal's triangle (https://en.wikipedia.org/wiki/Pascal%27s_triangle). Please refer to the aforementioned article for a mathematical explanation.

```javascript
// M = 1
let a1_m = -phi[1] / phi[0];
// Iterate to calculate coefficients
let coeff = [1, a1_m];
let tempCoeff = [1, a1_m];

let mu = 0;
let alpha = 0;
let k = 0;
for (let m = 0; m < M-1; m++){
    mu = 0;
    alpha = 0;
    // Calculate mu and alpha
    for (let i = 0; i<m+2; i++){
        mu += coeff[i]*phi[m+2-i];
        alpha += coeff[i]*phi[i];
    }
    k = - mu / alpha;
    // Calculate new coefficients
    coeff[m+2] = 0;
    for (let i = 1; i<m+3; i++){
        tempCoeff[i] = coeff[i] + coeff[m+2-i]*k;
    }
    coeff = tempCoeff.slice();
}

return coeff;
```

The aforementioned code provides the LPC coefficients. In my implementation I also store the k coefficients, as there are interesting modifications and visualizations that one can do with them.

### Using the LPC coefficients to filter an excitation signal
A voiced signal can be synthesized by filtering an impulse signal and the LPC coefficients, based on the vocal tract model. The impulse signal defines the pitch and can look like this: 1, -1, 0, 0, 0, ... , 0, 0, 1, -1, 0, 0, 0... 

The Web Audio API provides a filter node, the IIRFilterNode (https://www.w3.org/TR/webaudio/#iirfilternode). Unfortunatelly, the IIR filter defines the coefficients on its creation, and it is not designed to change the coefficients dynamically. As the Web Audio API says: "Once created, the coefficients of the IIR filter cannot be changed". An option would be to create a new IIRFilterNode for every frame, but that would be an overkill for the app (probably leading to garbage collector problems?). Therefore, I implemented the filter manually.

An IIR filter with feedback coefficients (our LPC coefficients) has the form of:
```javascript
y[n] = b[0]*x[n]/a[0] - a[1]*y[n-1] - a[2]*y[n-2] ... - a[M]*y[n-M]
```
where "y[n]" is the filtered signal, "x[n]" is the input signal, "b" are the feedforward coefficients and "a" are the feedback coefficients. In our case, "b[0]" and "a[0]" are 1.
```javascript
y[n] = b[0]*x[n]/a[0] - a[1]*y[n-1] - a[2]*y[n-2] ... - a[M]*y[n-M]
```

### Estimation of the fundamental frequency
In order to model tonal excitation of the vocal tract, an estimate of the fundamental frequency is required. For a fixed excitation period, the pulse-train excited synthesized signal sound very monotonous. Therefore, it leads to a qualitative improvement when for each block the fundamental frequency is estimated and the pulse-train signal is generated accordingly. This will be true mainly for tonal/voiced speech components.

An efficient way to estimate the fundamental frequency of speech is the autocorrelation method. For a periodic signal, its autocorrelation will display the same periodicity as the signal at the autocorrelation shift in samples corresponding to the period of the signal. Since for human speech, the fundamental frequency is in most cases within the range of 70 to 200 Hz, the range in which an autocorrelation peak is searched for can be limited to the range of equivalent shifts. They are computed by the following code:
```javascript
// 200 Hz upper frequency limit -> lower limit for periodicity in samples
this._lowerACFBound = Math.floor(sampleRate / 200);

// 70 Hz lower frequency limit -> upper limit
this._upperACFBound = Math.ceil(sampleRate / 70); 
```
As can be seen, the autocorrelation shifts are the inverse of the corresponding periods, and scaled to the sampling rate used in the processing scheme. Based on these boundaries we can search for the maximum of the frame-wise autocorrelation:
```javascript
for (let shift = this._lowerACFBound; shift<this._upperACFBound; shift++){
  this._fundPeriodBuffer[shift-this._lowerACFBound] = this.autoCorr(inBuffer, shift);
}
let maxIdx = this._lowerACFBound + this._fundPeriodBuffer.indexOf(Math.max(...this._fundPeriodBuffer));
```
Note that only the relevant values of the autocorrelation function need to be computed. In javascript, the `...` denotes the spread operator. This operation is necessary because the `Math.max()` function does not generalize to array type variables as well as in higher-level languages such as Matlab or Python, which natively support array operations. The expression `Math.max(...acfBuff)` is then equivalent to `Math.max(acfBuff[0], acfBuff[1], acfBuff[2] /*and so on*/)`. 

The tonal excitation is then generated based on the resulting period `periodSamples` for a single frame as follows:
```javascript
for (let i=this._pulseOffset; i<this._frameSize; i+=periodSamples){
  this._impulseSignal[i] = 1;
}
this._pulseOffset = lastIndex + periodSamples - this._frameSize;
```
The offset from the last pulse is saved in order to prevent inconsistencies inbetween block transitions, which could potentially result in clicks. Not shown is the normalization to the same RMS value per block as the error signal, so that the resulting synthesis signals has approximately the same energy per block as the original signal.

### Real-time microphone input
Within the web audio API, it is possible to also record and process audio signals from the user microphone. For this, the user can be asked whether or not they want to share their input via the following snippet:
```javascript
navigator.mediaDevices.getUserMedia({audio: true})
  .then(function(stream) {
    streamSource = audioCtx.createMediaStreamSource(stream);
  });
```
This step will create an AudioWorklet similar to the one required for file-wise processing. Since the framework is very modular, individual processing blocks can easily be connected, e.g. by connecting the audio source to the vocoder node and then to the output: 
```javascript
  streamSource.connect(vocoderNode).connect(audioCtx.destination);
```
Since a lot of interface options have the potential to interfere with each other, a change in the processing scheme is accompanied by a re-connection of all processing nodes, and depending on the user interface states the appropriate AudioWorklets are selected and set to the appropriate state. As an example, if the microphone input is activated via checking a box, the file selection dropdown menu for audio file input will be hidden until the input is changed again.

to continue...

## Next state

Quantization K's
Microphone
Visualization k's
Voice transofrmation


