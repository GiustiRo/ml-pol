import { Injectable } from '@angular/core';
import { Category, DrawingUtils, FaceLandmarker, FaceLandmarkerResult, FilesetResolver, ImageEmbedder, ImageEmbedderResult } from '@mediapipe/tasks-vision';
import { buildElement } from './MLPOL';

@Injectable({ providedIn: 'root' })
export class MediaPipeService {
    // ML Model and properties (WASM & Model provided by Google, you can place your own).
    private faceLandmarker!: FaceLandmarker;
    private imageEmbedder!: ImageEmbedder;
    private wasmUrl: string = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
    private modelAssetPath_FaceLandmarker: string = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
    private modelAssetPath_Embedder: string = "https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_small/float32/1/mobilenet_v3_small.tflite";
    // Native elements and types we need to interact to later.
    private page!: HTMLElement;
    private video!: HTMLVideoElement;
    private canvasElement!: HTMLCanvasElement;
    private canvasCtx!: CanvasRenderingContext2D;
    private layoutMounted: boolean = false;

    private imageEmbeddings: { front: ImageEmbedderResult | undefined, back: ImageEmbedderResult | undefined } = { front: undefined, back: undefined }

    // Toggle to draw complete face mesh.
    public displayDraws: boolean = false;
    // A state to toggle functionality.
    public tracking: boolean = false;

    // Dictionary of available challenges for the user to acomplish.
    public userChallenges: { [key: string]: { id: string, label: string, challenge: boolean, done: boolean, action?: Function } } = {
        SEL: { id: 'selfie', label: 'Selfie', challenge: true, done: false, action: () => this.__selfieChallenge() },
        POL: { id: 'proofOfLife', label: 'Proof Of Life', challenge: true, done: false, action: () => this.__polChallenge() },
        DOC: { id: 'identification', label: 'Documento', challenge: true, done: false, action: () => this.__docChallenge() },
        KYC: { id: 'knowYourCustomer', label: 'KYC (Comprobante)', challenge: true, done: false, action: () => { } },
    }
    public polChallenges: { [key: string]: { id: string, label: string, challenge: boolean, done: boolean } } = {
        blink: { id: 'blink', label: 'Blink', challenge: true, done: false },
        smile: { id: 'smile', label: 'Smile', challenge: true, done: false },
        eyebrows: { id: 'eyebrows', label: 'Raise your eyebrows', challenge: false, done: false },
        mouth: { id: 'mouth', label: 'Open your mouth', challenge: false, done: false },
    }

    constructor() {
        // this.initMP()
    }

    async initMP(): Promise<FaceLandmarker> {
        return this.faceLandmarker = await FaceLandmarker.createFromOptions(await FilesetResolver.forVisionTasks(this.wasmUrl), {
            baseOptions: { modelAssetPath: this.modelAssetPath_FaceLandmarker, delegate: "GPU" },
            outputFaceBlendshapes: true, runningMode: "VIDEO"
        }); // When FaceLandmarker is ready, you'll see in the console: Graph successfully started running.
    }

    private async initEmbedder() {
        return this.imageEmbedder = await ImageEmbedder.createFromOptions(
            await FilesetResolver.forVisionTasks(this.wasmUrl),
            {
                baseOptions: {
                    modelAssetPath: this.modelAssetPath_Embedder
                }, quantize: false, runningMode: "IMAGE"
            });
    }

    checkMediaAccess = () => (!(!!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) || !this.faceLandmarker) && (console.warn("user media or ml model is not available"), false);

    getUserMedia = (predictWebcam: any, videoParams: any) => navigator.mediaDevices.getUserMedia({ video: { ...videoParams } }).then((stream) => (this.video.srcObject = stream, this.video.addEventListener("loadeddata", predictWebcam)));

    private stopTracking(done: boolean = false, type: 'SEL' | 'POL' | 'DOC' | 'KYC') { // Stop and clear the video & canvas
        this.tracking = false; this.video.removeAllListeners!("loadeddata");
        (this.video.srcObject as MediaStream).getTracks().forEach(track => track.stop());
        this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        this.video.srcObject = null; this.layoutMounted = false;
        this.toggleLoader(false);

        document.querySelectorAll('.user-media')?.forEach(el => el.classList.remove('tracking'));
        if (done) this.userChallenges[type].done && setTimeout(() => document.querySelector(`#${this.userChallenges[type].id}`)?.classList.add('challenge-done'), 300);
        if (type == 'DOC') {
            document.querySelector('.document-layout')?.remove();
            this.imageEmbedder.close();
            this.video.classList.remove('unflip');

        }
    }

    private async setupVideoAndCanvas() {
        this.toggleLoader(true);
        this.page = document.querySelector('.challenge-page')!;
        this.video = document.querySelector('#user-video') as HTMLVideoElement;
        this.canvasElement = document.querySelector('#user-canvas') as HTMLCanvasElement;
        this.canvasCtx = this.canvasElement.getContext("2d") as CanvasRenderingContext2D;
        // document.querySelectorAll('.user-media:not(#user-overlay)')?.forEach(el => el.classList.add('tracking'));
    }

    toggleLoader(state: boolean) {
        if (state && document.querySelector('.spinner')) return;
        if (state) document.body.appendChild(buildElement('div', { class: 'spinner' }, [buildElement('img', { src: 'assets/images/spinner.gif' })]));
        else document.querySelector('.spinner')?.remove();
    }

    __selfieChallenge = async () => {
        console.log('🛡 - strating SEL challenge...');
        if (this.checkMediaAccess()) return;
        this.setupVideoAndCanvas(); this.tracking = true;
        let lastVideoTime = -1; let results: any = undefined;
        let predictWebcam = async () => {
            this.canvasElement.width = this.video.videoWidth; this.canvasElement.height = this.video.videoHeight; // Match Video & Canvas sizes.
            lastVideoTime !== this.video.currentTime && (lastVideoTime = this.video.currentTime, results = this.faceLandmarker?.detectForVideo(this.video, Date.now()));// Send the video frame to the model.

            if (lastVideoTime > 0) {
                document.querySelectorAll('.user-media:not(#user-overlay)')?.forEach(el => el.classList.add('tracking'));
                document.querySelector('#user-overlay')?.classList.add('tracking'); this.layoutMounted = true;
                if (results.faceLandmarks[0] && results.faceLandmarks[0][0] && results.faceLandmarks[0][0]?.x > 0.45 && results.faceLandmarks[0][0]?.x < 0.55 &&
                    results.faceLandmarks[0][0]?.y > 0.5 && results.faceLandmarks[0][0]?.y < 0.7 && !this.userChallenges['SEL'].done) {
                    document.querySelector('#user-overlay')?.classList.add('user-ok');
                    setTimeout(() => !this.userChallenges['SEL'].done && (this.userChallenges['SEL'].done = true), 1000);
                } else { try { document.querySelector('#user-overlay')?.classList.remove('user-ok'); } catch (error) { } }

                // Call this function until challenge is completed or canceled.
                if (this.userChallenges['SEL'].done) (this.stopTracking(true, 'SEL'), false);
            }

            this.tracking == true && window.requestAnimationFrame(predictWebcam);
        }
        console.log('🛡 - challenge ready and running...');
        this.getUserMedia(predictWebcam, true);
    }

    __polChallenge = async () => {
        console.log('🛡 - strating POL challenge...');
        if (this.checkMediaAccess()) return;
        this.setupVideoAndCanvas(); this.tracking = true;

        let lastVideoTime = -1; let results: any = undefined;
        let predictWebcam = async () => {
            this.canvasElement.width = this.video.videoWidth; this.canvasElement.height = this.video.videoHeight; // Match Video & Canvas sizes.
            lastVideoTime !== this.video.currentTime && (lastVideoTime = this.video.currentTime, results = this.faceLandmarker?.detectForVideo(this.video, Date.now()));// Send the video frame to the model.

            if (lastVideoTime > 0) {
                document.querySelectorAll('.user-media:not(#user-overlay)')?.forEach(el => el.classList.add('tracking'));
                this.layoutMounted = true; const drawingUtils = new DrawingUtils(this.canvasCtx!);

                // Check if the user blinked (you can customize this to expect a smile, etc). Let's assume there is only one face.
                if (results.faceLandmarks && results.faceBlendshapes && results.faceBlendshapes[0]) {
                    // console.log(results.faceBlendshapes![0].categories);
                    if (results.faceBlendshapes![0].categories?.find((shape: Category) => shape?.categoryName == "eyeBlinkRight")?.score > 0.4) {
                        (this.polChallenges['blink'].done = true, console.warn('Blink!'));
                    }// Blynk.
                    if (results.faceBlendshapes![0].categories?.find((shape: Category) => shape?.categoryName == "mouthSmileLeft")?.score > 0.6 &&
                        results.faceBlendshapes![0].categories?.find((shape: Category) => shape?.categoryName == "mouthSmileRight")?.score > 0.6) {
                        (this.polChallenges['smile'].done = true, console.warn('Smile!'));
                    }// Smile.
                }
                // Draw the results on the canvas (comment this out to improve performance or add even more markers like mouth, etc).
                if (results.faceLandmarks && this.displayDraws) for (const landmarks of results.faceLandmarks) {
                    [FaceLandmarker.FACE_LANDMARKS_TESSELATION, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, FaceLandmarker.FACE_LANDMARKS_LEFT_EYE]
                        .every((type, i) => drawingUtils.drawConnectors(landmarks, type, { color: "#C0C0C070", lineWidth: i == 0 ? 1 : 4 }))
                };

                if (this.polChallenges['blink'].done && this.polChallenges['smile'].done) setTimeout(() => this.userChallenges['POL'].done = true, 1000);
            }
            // Call this function again to keep predicting when the browser is ready.
            if (this.userChallenges['POL'].done) (this.stopTracking(true, 'POL'), false);
            this.tracking == true && window.requestAnimationFrame(predictWebcam);

        }
        console.log('🛡 - challenge ready and running...');
        this.getUserMedia(predictWebcam, true);
    }

    __docChallenge = async () => {
        this.toggleLoader(true);
        await this.initEmbedder();
        this.getLocaleCode();
        const userDoc = buildElement('img', { src: this.getDocumentByLocale(this.getLocaleCode()), class: 'user-document front-document' })
        console.log(userDoc);
        const imgRef = document.body.appendChild(userDoc);
        setTimeout(() => {

            this.imageEmbeddings.front = this.imageEmbedder.embed(imgRef as HTMLImageElement);

            if (this.checkMediaAccess()) return;
            this.setupVideoAndCanvas(); this.tracking = true;
            this.video.classList.add('unflip');
            this.imageEmbedder.applyOptions({ runningMode: "VIDEO" });
            let lastVideoTime = -1; let results: any = undefined;
            let predictWebcam = async () => {
                this.canvasElement.width = this.video.videoWidth; this.canvasElement.height = this.video.videoHeight; // Match Video & Canvas sizes.
                lastVideoTime !== this.video.currentTime && (lastVideoTime = this.video.currentTime, results = this.imageEmbedder?.embedForVideo(this.video, Date.now()));// Send the video frame to the model.

                if (lastVideoTime > 0) {

                    document.querySelectorAll('.user-media:not(#user-overlay)')?.forEach(el => el.classList.add('tracking'));
                    if (!document.querySelector('.document-layout')) document.querySelector('.challenge-page')!.appendChild(buildElement('div', { class: 'user-media document-layout tracking' }, [docLayout]));
                    // document.querySelector('#user-overlay')?.classList.add('tracking', 'document-overlay-frame'); 
                    this.layoutMounted = true;

                    if (this.imageEmbeddings.front && results) {
                        const similarity = ImageEmbedder.cosineSimilarity(
                            this.imageEmbeddings.front!.embeddings[0],
                            results.embeddings[0]
                        );
                        // console.log(similarity);
                        // Tiene que estar bien iluminado para llegar a este nivel...
                        if (similarity > 0.42) {
                            console.log('Match');
                            setTimeout(() => !this.userChallenges['DOC'].done && (this.userChallenges['DOC'].done = true), 1000)
                        }
                    }
                }
                // if (this.userChallenges['DOC'].done) setTimeout(() => this.userChallenges['DOC'].done = true, 1000);

                // Call this function again to keep predicting when the browser is ready.
                if (this.userChallenges['DOC'].done) (this.stopTracking(true, 'DOC'), false);
                this.tracking == true && window.requestAnimationFrame(predictWebcam);

            }
            console.log('🛡 - challenge ready and running...');
            this.getUserMedia(predictWebcam, { facingMode: 'environment' });
            const docLayout = this.getDocumentLayoutByLocale(this.getLocaleCode());
        }, 500)

    }

    getLocaleCode = () => 'es-UY';

    getDocumentByLocale(locale: string, isBack?: boolean) {
        switch (locale) {
            case 'es-UY': return `assets/locale/docs/uy/${!isBack ? 'doc_front' : 'doc_back'}.jpg`;
            default: return `assets/locale/docs/uy/${!isBack ? 'doc_front' : 'doc_back'}.jpg`;
        }
    }
    getDocumentLayoutByLocale(locale: string, isBack?: boolean) {
        switch (locale) {
            case 'es-UY': return buildElement('img', { src: `assets/locale/docs/uy/${!isBack ? 'layout_front' : 'layout_back'}.png`, class: 'user-media document-layout-picture' });
            default: return buildElement('img', { src: `assets/locale/docs/uy/${!isBack ? 'layout_front' : 'layout_back'}.png`, class: 'user-document-layout' });
        }
    }
}