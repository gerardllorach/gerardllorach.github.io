import {DPRT} from './modules/DPRT.js';
import {displayDPRTResults, displayInstructions} from './modules/displayInstructions.js';

const canvas = document.getElementById("myCanvas");
canvas.width = document.body.clientWidth;
canvas.height = document.body.clientHeight;

const RPM = 3.4;
const audioEl = {};

const onFinish = () => {
	console.log(out);
	let acc = displayDPRTResults(canvas,out);
	displayInstructions(canvas, "Accuracy: " + parseInt(acc) + "%", ()=>{ console.log ("hoho")});
}

const out = DPRT(canvas, RPM, audioEl, onFinish);


// When window loads or resizes
window.onload = window.onresize = () => {
	canvas.width = document.body.clientWidth;
	canvas.height = document.body.clientHeight;
}