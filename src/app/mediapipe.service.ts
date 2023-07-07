import { Injectable } from '@angular/core';
import { Category, DrawingUtils, FaceLandmarker, FaceLandmarkerResult, FilesetResolver } from '@mediapipe/tasks-vision';

@Injectable({ providedIn: 'root' })
export class MediaPipeService {
    // ML Model and properties (WASM & Model provided by Google, you can place your own).
    private faceLandmarker!: FaceLandmarker;
    private wasmUrl: string = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
    private modelAssetPath: string = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
    // Native elements and types we need to interact to later.
    private page!: HTMLElement;
    private video!: HTMLVideoElement;
    private canvasElement!: HTMLCanvasElement;
    private canvasCtx!: CanvasRenderingContext2D;
    private layoutMounted: boolean = false;

    // Toggle to draw complete face mesh.
    public displayDraws: boolean = false;
    // A state to toggle functionality.
    public tracking: boolean = false;

    // Dictionary of available challenges for the user to acomplish.
    public userChallenges: { [key: string]: { id: string, label: string, challenge: boolean, done: boolean, action?: Function } } = {
        SEL: { id: 'selfie', label: 'Selfie', challenge: true, done: false, action: () => this.selfieChallenge() },
        POL: { id: 'proofOfLife', label: 'Proof Of Life', challenge: true, done: false, action: () => { } },
        DOC: { id: 'identification', label: 'Documento', challenge: true, done: false, action: () => { } },
        KYC: { id: 'knowYourCustomer', label: 'KYC (Comprobante)', challenge: true, done: false, action: () => { } },
        // eyebrows: { id: 'eyebrows', label: 'Raise your eyebrows', challenge: false, done: false },
        // mouth: { id: 'mouth', label: 'Open your mouth', challenge: false, done: false },
    }
    public polChallenges: { [key: string]: { id: string, label: string, challenge: boolean, done: boolean } } = {
        blink: { id: 'blink', label: 'Blink', challenge: true, done: false },
        smile: { id: 'smile', label: 'Smile', challenge: true, done: false },
        eyebrows: { id: 'eyebrows', label: 'Raise your eyebrows', challenge: false, done: false },
        mouth: { id: 'mouth', label: 'Open your mouth', challenge: false, done: false },
    }

    constructor() { this.initMP() }

    public toggleTracking() { this.tracking = !this.tracking, this.tracking ? this.startTracking() : this.stopTracking(); }

    private async initMP(): Promise<void> {
        this.faceLandmarker = await FaceLandmarker.createFromOptions(await FilesetResolver.forVisionTasks(this.wasmUrl), {
            baseOptions: { modelAssetPath: this.modelAssetPath, delegate: "GPU" },
            outputFaceBlendshapes: true, // We will draw the face mesh in canvas.
            runningMode: "VIDEO",
        }); // When FaceLandmarker is ready, you'll see in the console: Graph successfully started running.
    }

    public startTracking() {
        this.setupVideoAndCanvas();
        // Check if we can access user media api.
        (!(!!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) || !this.faceLandmarker) && (console.warn("user media or ml model is not available"), false);
        // Everything is ready to go!
        navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => (this.video.srcObject = stream, this.video.addEventListener("loadeddata", predictWebcam)));
        let lastVideoTime = -1; let results: any = undefined; const drawingUtils = new DrawingUtils(this.canvasCtx!);
        let predictWebcam = async () => {
            // Resize the canvas to match the video size.
            this.canvasElement.width = this.video.videoWidth; this.canvasElement.height = this.video.videoHeight;
            // Send the video frame to the model.
            lastVideoTime !== this.video.currentTime && (lastVideoTime = this.video.currentTime, results = this.faceLandmarker?.detectForVideo(this.video, Date.now()));
            if (results.faceLandmarks[0] && results.faceLandmarks[0][0] && results.faceLandmarks[0][0]?.x > 0.45 && results.faceLandmarks[0][0]?.x < 0.55 &&
                results.faceLandmarks[0][0]?.y > 0.5 && results.faceLandmarks[0][0]?.y < 0.7 &&
                !this.userChallenges['SEL'].done) {
                console.log('nice!', results.faceLandmarks[0][0]);
                // drawingUtils.drawConnectors(results.faceLandmarks[0], FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, { color: "#00800050", lineWidth: 5 });
                document.querySelector('#user-overlay')?.classList.add('user-ok');
                setTimeout(() => {
                    if (!this.userChallenges['SEL'].done) {
                        this.userChallenges['SEL'].done = true;
                        this.stopTracking(true);
                    };
                }, 2000);

            } else { try { document.querySelector('#user-overlay')?.classList.remove('user-ok'); } catch (error) { } }

            if (this.userChallenges['SEL'].done) return;


            // Draw the results on the canvas (comment this out to improve performance or add even more markers like mouth, etc).
            if (results.faceLandmarks && this.displayDraws) for (const landmarks of results.faceLandmarks) {
                [FaceLandmarker.FACE_LANDMARKS_TESSELATION, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, FaceLandmarker.FACE_LANDMARKS_LEFT_EYE]
                    .every((type, i) => drawingUtils.drawConnectors(landmarks, type, { color: "#C0C0C070", lineWidth: i == 0 ? 1 : 4 }))
            };

            // Check if the user blinked (you can customize this to expect a smile, etc). Let's assume there is only one face.
            if (results.faceLandmarks && results.faceBlendshapes && results.faceBlendshapes[0] && results.faceBlendshapes![0].categories?.find(
                (shape: Category) => shape?.categoryName == "eyeBlinkRight")?.score > 0.4) (this.polChallenges['blink'].done = true, console.warn('Guiño Guiño'));

            if (!this.layoutMounted) {
                console.log('🛡 - challenge ready and running...')
                // this.page.appendChild(this.generateOverlayRef());
                document.querySelector('#user-overlay')?.classList.add('tracking');
            }
            this.layoutMounted = true;
            // Call this function again to keep predicting when the browser is ready.
            this.tracking == true && window.requestAnimationFrame(predictWebcam);
        }
    }

    private stopTracking(done?: boolean) { // Stop and clear the video & canvas
        this.tracking = false; (this.video.srcObject as MediaStream).getTracks().forEach(track => track.stop());
        this.video.srcObject = null; this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        document.querySelectorAll('.user-media')?.forEach(el => el.classList.remove('tracking'));
        document.querySelectorAll('.user-media')?.forEach(el => el.remove());
        this.layoutMounted = false;

        if (done) setTimeout(() => document.querySelector(`#${this.userChallenges['SEL'].id}`)?.classList.add('challenge-done'), 300);
    }

    private async setupVideoAndCanvas() {
        this.page = document.querySelector('.challenge-page')!;
        this.video = document.querySelector('#user-video') as HTMLVideoElement;
        this.canvasElement = document.querySelector('#user-canvas') as HTMLCanvasElement;
        this.canvasCtx = this.canvasElement.getContext("2d") as CanvasRenderingContext2D;
        document.querySelectorAll('.user-media:not(#user-overlay)')?.forEach(el => el.classList.add('tracking'));
    }
    
    selfieChallenge = () => {
        console.log('🛡 - strating selfie challenge...');
        this.toggleTracking();
    }
}