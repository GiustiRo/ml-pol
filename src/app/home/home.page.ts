import { AfterViewInit, Component, OnInit } from '@angular/core';
import { IonicModule } from '@ionic/angular';

import { Category, Classifications, DrawingUtils, FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';


@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [IonicModule],
})
export class HomePage implements OnInit, AfterViewInit {
  // ML Model and properties (WASM & Model provided by Google, you can place your own).
  faceLandmarker!: FaceLandmarker;
  wasmUrl: string = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
  modelAssetPath: string = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
  // Native elements and types we need to interact to later.
  video!: HTMLVideoElement;
  canvasElement!: HTMLCanvasElement;
  canvasCtx!: CanvasRenderingContext2D;
  videoWidth = window.innerWidth;
  // A state to toggle functionality.
  tracking: boolean = false;
  // A challenge state for the user.
  userDidBlink: boolean = false;

  constructor() { }

  async ngOnInit(): Promise<void> {
    this.faceLandmarker = await FaceLandmarker.createFromOptions(await FilesetResolver.forVisionTasks(this.wasmUrl), {
      baseOptions: { modelAssetPath: this.modelAssetPath, delegate: "GPU" },
      outputFaceBlendshapes: true,
      runningMode: "VIDEO",
    });
  }

  async ngAfterViewInit(): Promise<void> {
    this.video = document.getElementById("user-video") as HTMLVideoElement;
    this.canvasElement = document.getElementById("user-canvas") as HTMLCanvasElement;
    this.canvasCtx = this.canvasElement.getContext("2d") as CanvasRenderingContext2D;
  }

  toggleTracking = () => (this.tracking = !this.tracking, this.tracking ? this.startTracking() : this.stopTracking());


  startTracking() {
    (!(!!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) || !this.faceLandmarker) && (console.warn("user media or ml model is not available"), false);
    // Everything is ready to go!
    navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => (this.video.srcObject = stream, this.video.addEventListener("loadeddata", predictWebcam)));
    let lastVideoTime = -1; let results: any = undefined; const drawingUtils = new DrawingUtils(this.canvasCtx!);
    let predictWebcam = async () => {
      // Resize the canvas to match the video size.
      this.canvasElement.width = this.video.videoWidth; this.canvasElement.height = this.video.videoHeight;
      // Send the video frame to the model.
      lastVideoTime !== this.video.currentTime && (lastVideoTime = this.video.currentTime, results = this.faceLandmarker.detectForVideo(this.video, Date.now()));
      // Draw the results on the canvas (comment this out to improve performance or add even more markers like mouth, etc).
      if (results.faceLandmarks) for (const landmarks of results.faceLandmarks) {
        [FaceLandmarker.FACE_LANDMARKS_TESSELATION, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, FaceLandmarker.FACE_LANDMARKS_LEFT_EYE]
          .every((type, i) => drawingUtils.drawConnectors(landmarks, type, { color: "#C0C0C070", lineWidth: i == 0 ? 1 : 4 }))
      };
      // Check if the user blinked (you can customize this to expect a smile, etc). Let's assume there is only one face.
      if (results.faceLandmarks && results.faceBlendshapes && results.faceBlendshapes[0] && results.faceBlendshapes![0].categories?.find(
        (shape: Category) => shape?.categoryName == "eyeBlinkRight")?.score > 0.4) (this.userDidBlink = true, alert('Guiño Guiño'));
      // Call this function again to keep predicting when the browser is ready.
      this.tracking == true && window.requestAnimationFrame(predictWebcam);
    }
  }

  stopTracking() {
    this.tracking = false; (this.video.srcObject as MediaStream).getTracks().forEach(track => track.stop());
    this.video.srcObject = null; this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
  }
}

