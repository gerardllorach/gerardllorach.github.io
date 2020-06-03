H+A Fortgeschrittenenprojekt SoSe 2020
Gerard Llorach

Project description

1) The web-browser
The computational power of the web-browser has been increasing over the years. Some years ago, doing DSP in the browser was not the best option, due to the asynchronous nature of javascript. With the new AudioWorklet (still experimental) one can access each audio block and do signal processing in real-time.

Sadly, there are not many demos working with the AudioWorklet (at least I could not find them). The developer's team in charge has some basic demos here: https://googlechromelabs.github.io/web-audio-samples/audio-worklet/. Most working demos of real-time DSP use the ScriptProcessor node, which is going to be deprecated. The ScriptProcessor runs in the main thread of javascript and it is not in synchrony with the audio processing thread, therefore some its application is limited. A insightful presentation about the AudioWorklet can be found here: https://www.youtube.com/watch?v=g1L4O1smMC0. The Web Audio API can be found here: https://www.w3.org/TR/webaudio/

2) Requirements for the AudioWorklet
One of the requirements of the AudioWorklet is that the website has to be provided by an HTTPS server. Initially I created a nodejs server with self-signed certificates to run locally. But I later discovered that github provides HTTPS out of the box and thus switched to this platform to develop the application. Another requirement for the AudioWorklet is that the code has to be written in a different .js file, which is loaded from the main javascript thread.

3) Block processing with the AudioWorklet
The AudioWorklet code is called for each new audio block. The audio blocks consist of 128 samples (render quantum), which corresponds to approx. 3ms at 44.1 kHz. The sampling rate is set by default according to the sampling rate of the output device. If sampling rate is manually set, some latency issues could appear as the browser will have to resample the audio output to match the sampling rate of the device. Therefore I prefer to make my application invariant to the sampling rate. More info can be found here: https://www.w3.org/TR/webaudio/#AudioContext-constructors

4) Preparing the buffers/frames
In order to calculate the LPC coefficients (or other operations) we need more than 128 samples. Therefore we need to store consecutive audio blocks until we fill a buffer. Once the buffer is filled, we can do operations on a frame basis. I decided to make the buffer size a multiple of 128, this way it is possible to perform the frame operation at the end an audio block. It should be possible to use buffer sizes that are not multiple of 128, but I just found the other way easier.







