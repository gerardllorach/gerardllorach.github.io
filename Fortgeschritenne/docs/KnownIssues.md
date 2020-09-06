## Known issues
### Sampling frequency
According to the Web Audio API, the sampling rate of the AudioContext can be modified. LPC works better with a sampling rate around 8kHz, as most of the speech information is within that range. The default sampling rate of the AudioContext depends on the operating system. In our computers it ranged from 44.1kHz to 48kHz. Thus, we modified the sampling frequency of the AudioContext to 8kHz. Nevertheless, while testing the application, we noticed some clicks in the synthesized audio. We double checked our code but could not find a mistake. These clicks disappeared once we set the sampling rate to default. The Web Audio API is still experimental, thus we believe that the artifacts came from the internal processing of the browser. This is a pitty because some of the effects are less attractive in higher sampling rates (such as reversing the PARCOR coefficients).

### Audio Worklets and updates
During the project, one of us updated Windows and suddenly the app stopped working. Even the sample demos from the Audio Worklet group failed to run. After the semester break, there was another Windows update that fixed the issue. This technology is still experimental and in development, therefore it is quite probable that at some point it stops working due to recent updates.

 ### Real-time vocal tract length modifications
The vocal tract length can be modified using a slider or the 2D voice map. When the vocal tract lenght is modified, some clicks appear in the audio signal during the change. This can be annoying when playing around with the parameters. We believe that these clicks appear because the array containing the audio buffer is created new. This new declaration could be the reason of empty or unreferenced arrays that generate the clicks in the audio signal. Ideally this should not happen, but as the AudioWorklet has to run every 128 samples (3 ms at 44.1kHz) it can be that the new array is not created fast enough.
```javascript
this.resampBuffer = new Float32Array(newFramesize);
```
