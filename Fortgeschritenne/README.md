# H+A Fortgeschrittenenprojekt SoSe 2020
 Gerard Llorach and Mattes Ohlenbusch

## Description
This repository contains the project for the subject "Fortgeschrittenen-Projektpraktikum Hörtechnik und Audiologie". The project consists on using LPC coefficients to do voice transformations and/or visualization of the vocal tract in real-time. The description of the project is organized in chapters.

## Live demo
https://gerardllorach.github.io/Fortgeschritenne/

Hint: Drag and drop audio files (.wav and .mp3) at the bottom of the webpage to test it with your own files!

## Chapters
#### [Introduction to the Web Audio API](docs/Introduction.md)
An introduction to the Web Audio API and AudioWorklets.

#### [Chapter 1. Overlap and add](docs/Chapter%201.%20Overlap%20and%20add.md)
Audio blocks, buffers and frames with the Web Audio API.

#### [Chapter 2. LPC coefficients](docs/Chapter%202.%20LPC%20coefficients.md)
The LPC coefficients and the Levinson algorithm.

#### [Chapter 3. Voice synthesis](docs/Chapter%203.%20Voice%20synthesis.md)
Excitation signals, signal energy, pitch detection and filtering.

#### [Chapter 4. Voice transformations](docs/Chapter%204.%20Voice%20transformations.md)
Transformation of K coefficients (PARCOR coeff) and vocal tract length modifications.

#### [Chapter 5. Web interface](docs/Chapter%205.%20Web%20interface.md)
Canvas HTML, microphone input, drag and drop of audio files.

#### Chapter 6. Visualization
Yet to do


## Todo list
* Fix excitation signal (error signal and excitation signal are very different) (Problem with excitation signal comes from high sampling rate (LPC is used to predict high frequency and its not so useful for speech glottal separation).)
* Discontinuities between pulses
* Spectral representation (use Web Audio API fft)
* Manual resampling as Audio Worklet module?
* Refactor and separate js files (resampling library)
* 2D interface (age - gender) (requires vibrato and good speech reconstruction quality)

* Write more in the chapters
