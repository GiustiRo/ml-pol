import { Injectable } from '@angular/core';
import { Category, DrawingUtils, FaceLandmarker, FilesetResolver, ImageClassifier, ImageClassifierResult, ImageEmbedder, ImageEmbedderResult } from '@mediapipe/tasks-vision';
import { buildElement, setMessage } from './MLPOL';

const c = (msg: any) => console.log('👨‍💻 - ' + msg);
type userPictureType = { raw: Blob | undefined, masked: HTMLImageElement | undefined, buffer?: any[], matrix?: any[] };

@Injectable({ providedIn: 'root' })
export class MediaPipeService {
    private devMode = true; // Toggle to show/hide dev data.

    // ML Model and properties (WASM & Model provided by Google, you can place your own).
    private faceLandmarker!: FaceLandmarker;
    private imageEmbedder!: ImageEmbedder;
    private imageClassifier!: ImageClassifier;
    private wasmUrl: string = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
    // private modelAssetPath_FaceLandmarker: string = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
    // private modelAssetPath_Embedder: string = "https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_small/float32/1/mobilenet_v3_small.tflite";
    private modelsPaths = {
        faceLandmarker: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        embedder: "https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_small/float32/1/mobilenet_v3_small.tflite",
        clasifier: "https://storage.googleapis.com/mediapipe-models/image_classifier/efficientnet_lite0/float32/1/efficientnet_lite0.tflite"
    }
    // Native elements and types we need to interact to later.
    // private page!: HTMLElement;
    private video!: HTMLVideoElement;
    private canvasElement!: HTMLCanvasElement;
    private canvasCtx!: CanvasRenderingContext2D;
    // private layoutMounted: boolean = false;

    private imageEmbeddings: { front: ImageEmbedderResult | undefined, back: ImageEmbedderResult | undefined } = { front: undefined, back: undefined }

    // A state to toggle while MP is running.
    public tracking: boolean = false;

    // Dictionary of available challenges for the user to acomplish.
    public userChallenges: { [key: string]: { id: string, label: string, challenge: boolean, done: boolean, action?: Function } } = {
        POL: { id: 'proofOfLife', label: 'Proof Of Life', challenge: true, done: false, action: () => this.preloadState('POL') },
        SEL: { id: 'selfie', label: 'Selfie', challenge: true, done: false, action: () => this.preloadState('SEL') },
        DOC: { id: 'identification', label: 'Documento', challenge: true, done: false, action: () => this.preloadState('DOC') },
        KYC: { id: 'knowYourCustomer', label: 'KYC (Comprobante)', challenge: true, done: false, action: () => { } },
    }
    public polChallenges: { [key: string]: { id: string, label: string, challenge: boolean, done: boolean } } = {
        blink: { id: 'blink', label: 'Blink', challenge: true, done: false },
        smile: { id: 'smile', label: 'Smile', challenge: true, done: false },
        /*TODO*/eyebrows: { id: 'eyebrows', label: 'Raise your eyebrows', challenge: false, done: false },
        /*TODO*/mouth: { id: 'mouth', label: 'Open your mouth', challenge: false, done: false },
        /*TODO*/head: { id: 'headMovement', label: 'Move your head', challenge: false, done: false },
    }

    private userPictures: { doc: userPictureType, selfie: userPictureType } = {
        doc: { raw: undefined, masked: undefined, buffer: [], matrix: [] },
        selfie: { raw: undefined, masked: undefined, buffer: [], matrix: [] }
    }

    selfiePictures = {
        far: { taking: false, raw: undefined },
        close: { taking: false, raw: undefined },
    }

    constructor() { }

    // ML & MODELS INITIALIZERS ###########################################################################
    // #########################################################################################
    // #########################################################################################
    async initMP(): Promise<FaceLandmarker> {
        return this.faceLandmarker = await FaceLandmarker.createFromOptions(await FilesetResolver.forVisionTasks(this.wasmUrl), {
            baseOptions: { modelAssetPath: this.modelsPaths.faceLandmarker, delegate: "GPU" },
            outputFaceBlendshapes: true, runningMode: "VIDEO", outputFacialTransformationMatrixes: true
        }); // When FaceLandmarker is ready, you'll see in the console: Graph successfully started running.
    }

    private async initEmbedder() {
        return this.imageEmbedder = await ImageEmbedder.createFromOptions(
            await FilesetResolver.forVisionTasks(this.wasmUrl), {
            baseOptions: { modelAssetPath: this.modelsPaths.embedder },
            quantize: false, runningMode: "IMAGE"
        });
    }

    private async initImageClassifier() {
        return this.imageClassifier = await ImageClassifier.createFromOptions(
            await FilesetResolver.forVisionTasks(this.wasmUrl), {
            baseOptions: { modelAssetPath: this.modelsPaths.clasifier },
            runningMode: "IMAGE", maxResults: 10,
        });
    }

    // COMMON CHALLENGE METHODS ###########################################################################
    // #########################################################################################
    // #########################################################################################
    checkMediaAccess = () => (!(!!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) || !this.faceLandmarker) && (console.warn("user media or ml model is not available"), this.toggleLoader(false), false);

    getUserMedia = (predictWebcam: any, videoParams: any) => navigator.mediaDevices.getUserMedia({ video: { ...videoParams, frameRate: { min: 30, max: 30 } /*width: { ideal: 1920, max: 1920 }, height: { ideal: 1080, max: 1080 } */ } }).then((stream) => (this.video.srcObject = stream, this.video.addEventListener("loadeddata", predictWebcam)));

    preloadState = (type: 'POL' | 'SEL' | 'DOC' | 'KYC') => {
        this.toggleLoader(true); setTimeout(() => {
            if (type == 'POL') this.__polChallenge();
            if (type == 'SEL') this.__selfieChallenge();
            if (type == 'DOC') this.__docChallenge();
        }, 300);
    }

    private async stopTracking(done: boolean = false, type: 'SEL' | 'POL' | 'DOC' | 'KYC') { // Stop and clear the video & canvas
        this.tracking = false; this.video.removeAllListeners!("loadeddata");
        (this.video.srcObject as MediaStream).getTracks().forEach(track => track.stop());
        this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        this.video.srcObject = null; this.toggleLoader(false); setMessage('', 0); if (done) this.markAsDone(type);
        document.querySelectorAll('.user-media')?.forEach(el => el.classList.remove('tracking'));
        if (type == 'SEL') {
            try {
                (document.querySelector('#user-overlay') as HTMLElement).style.scale = '0.7';
                document.querySelector('#user-overlay')?.classList.remove('user-ok');
            } catch (error) { }
            const isFaceClear = await this.postSelfieValidation();
            this.toggleLoader(false);
            if (isFaceClear) {
                this.checkAndCompareUserPictures(type);
                this.markAsDone(type);
            } else {
                alert(`Please remove any accessory you are wareing and try again.\n (avoid using sunglasses, masks, headphones, etc)`);
                this.markAsFailed(type);
            }
        }
        if (type == 'DOC') {
            document.querySelector('.document-layout')?.remove();
            this.video.classList.remove('unflip');
            this.canvasElement.classList.remove('unflip');
            this.imageEmbedder.close();
            this.checkAndCompareUserPictures(type);
        }
        // setTimeout(() => this.toggleDevData(null, null, true), 1000);
    }

    private async setupVideoAndCanvas() {
        this.video = document.querySelector('#user-video') as HTMLVideoElement;
        this.canvasElement = document.querySelector('#user-canvas') as HTMLCanvasElement;
        this.canvasCtx = this.canvasElement.getContext("2d") as CanvasRenderingContext2D;
    }

    toggleLoader(state: boolean) {
        if (state && document.querySelector('.spinner')) return;
        if (state) document.body.appendChild(buildElement('div', { class: 'spinner' }, [buildElement('img', { src: 'assets/images/spinner.gif' })]));
        else document.querySelector('.spinner')?.remove();
    }

    commonChallengeSet(type: 'POL' | 'SEL' | 'DOC' | 'KYC'): { time: number, results: any } | false {
        this.toggleLoader(true); if (this.checkMediaAccess()) return false; c(`[${type}] - strating challenge...`);
        this.setupVideoAndCanvas(); this.tracking = true;
        this.userChallenges[type].done = false;
        return { time: -1, results: null }
    }


    // CHALLENGES METHODS ###########################################################################
    // #########################################################################################
    // #########################################################################################
    __polChallenge = async () => {
        const ccs = this.commonChallengeSet('POL');
        if (!ccs) return;
        this.faceLandmarker.applyOptions({ runningMode: "VIDEO" });
        let predictWebcam = async () => {
            ccs.time !== this.video.currentTime && (ccs.time = this.video.currentTime, ccs.results = this.faceLandmarker?.detectForVideo(this.video, Date.now()));// Send the video frame to the model.
            if (ccs.time > 0) {
                this.canvasElement.width = this.video.videoWidth; this.canvasElement.height = this.video.videoHeight;
                document.querySelectorAll('.user-media:not(#user-overlay)')?.forEach(el => el.classList.add('tracking'));
                const drawingUtils = new DrawingUtils(this.canvasCtx!);

                if (ccs.results.faceLandmarks && ccs.results.faceBlendshapes && ccs.results.faceBlendshapes[0]) {
                    if (ccs.results.faceBlendshapes![0].categories?.find((shape: Category) => shape?.categoryName == "eyeBlinkRight")?.score > 0.4) {
                        (this.polChallenges['blink'].done = true, console.warn('Blink!'));
                    }// Blynk.
                    if (ccs.results.faceBlendshapes![0].categories?.find((shape: Category) => shape?.categoryName == "mouthSmileLeft")?.score > 0.6 &&
                        ccs.results.faceBlendshapes![0].categories?.find((shape: Category) => shape?.categoryName == "mouthSmileRight")?.score > 0.6) {
                        (this.polChallenges['smile'].done = true, console.warn('Smile!'));
                    }// Smile.
                }
                if (ccs.results.faceLandmarks && this.devMode) for (const landmarks of ccs.results.faceLandmarks) {
                    [FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, FaceLandmarker.FACE_LANDMARKS_LEFT_EYE]
                        .every((type, i) => drawingUtils.drawConnectors(landmarks, type, { color: "#C0C0C070", lineWidth: i == 0 ? 1 : 4 }))
                };
                if (this.polChallenges['blink'].done && this.polChallenges['smile'].done) setTimeout(() => this.userChallenges['POL'].done = true, 1000);
            }
            if (this.userChallenges['POL'].done) { this.stopTracking(true, 'POL'); return; };
            this.tracking == true && window.requestAnimationFrame(predictWebcam);
        }
        this.getUserMedia(predictWebcam, true);
        c('👨‍💻 - challenge ready and running...');
    }

    __selfieChallenge = async () => {
        const ccs = this.commonChallengeSet('SEL'); if (!ccs) return;
        this.faceLandmarker.applyOptions({ runningMode: "VIDEO" });
        const passSEL = { faceClose: false, faceFar: false }; const challengeTiming = 1500;
        let now = -1; const processTiming = 1.0/*1.0-0.5*/; let layerMounted = false;
        let predictWebcam = async () => {
            ccs.time !== this.video.currentTime && (ccs.time = this.video.currentTime/*, ccs.results = this.faceLandmarker?.detectForVideo(this.video, Date.now())*/);// Send the video frame to the model.
            if (ccs.time > 0 && now !== Math.round(ccs.time) * processTiming) {
                now = Math.round(ccs.time) * processTiming;
                console.log(now);
                console.log(ccs.results);

                this.canvasElement.width = this.video.videoWidth; this.canvasElement.height = this.video.videoHeight;
                ccs.results = this.faceLandmarker?.detectForVideo(this.video, Date.now());
                if (!layerMounted) { document.querySelectorAll('.user-media')?.forEach(el => el.classList.add('tracking')); layerMounted = true; }
                if (!passSEL.faceClose && !passSEL.faceFar) setMessage('Acercá tu cara al centro de la pantalla', 2.0);
                if (ccs.results.faceLandmarks[0] && ccs.results.faceLandmarks[0][0] && ccs.results.faceLandmarks[0][0]?.x > 0.45 && ccs.results.faceLandmarks[0][0]?.x < 0.55 &&
                    ccs.results.faceLandmarks[0][0]?.y > 0.5 && ccs.results.faceLandmarks[0][0]?.y < 0.7 && !this.userChallenges['SEL'].done) {
                    console.log('z: ', +ccs.results.faceLandmarks[0][0]?.z);
                    if (!passSEL.faceClose) {
                        if (+ccs.results.faceLandmarks[0][0]?.z < (this.isMobile() ? -0.07 : -0.035)) { // ~0.03
                            setMessage('Perfecto, aguardá un segundo...', 2.1); c('close done..');
                            document.querySelectorAll('#user-overlay, #user-message')?.forEach(el => el.classList.add('user-ok'));
                            passSEL.faceClose = true; await new Promise((resolve, _) => setTimeout(() => resolve(null), challengeTiming));
                            document.querySelectorAll('#user-overlay, #user-message')?.forEach(el => el.classList.remove('user-ok'));
                            (document.querySelector('#user-overlay') as HTMLElement).style.scale = '0.6 0.5';
                            if (this.selfiePictures.close.taking) return; c('taking close selfie...'); this.selfiePictures.close.taking = true;
                            this.captureImage().then((img) => { (this.selfiePictures.close.raw as unknown) = img as Blob; this.selfiePictures.close.taking = false; });
                        };
                    }
                    // if (passSEL.faceClose && !passSEL.faceFar) 
                    if (passSEL.faceClose && !passSEL.faceFar) {
                        setMessage('Ahora alejá tu cara un poco de la cámara.', 2.2);
                        if (+ccs.results.faceLandmarks[0][0]?.z > (this.isMobile() ? -0.07 : -0.033)) { // ~0.02
                            setMessage('Bien, un segundo más...', 2.3); c('far done..');
                            document.querySelectorAll('#user-overlay, #user-message')?.forEach(el => el.classList.add('user-ok'));
                            passSEL.faceFar = true; await new Promise((resolve, _) => setTimeout(() => resolve(null), challengeTiming));
                            document.querySelectorAll('#user-overlay, #user-message')?.forEach(el => el.classList.remove('user-ok'));
                            if (this.selfiePictures.far.taking) return; c('taking close selfie...'); this.selfiePictures.far.taking = true;
                            this.captureImage().then((img) => { (this.selfiePictures.far.raw as unknown) = img as Blob; this.selfiePictures.far.taking = false; });
                        };
                    }
                    if (passSEL.faceClose && passSEL.faceFar) { setMessage('¡Listo!', 2.9); setTimeout(() => !this.userChallenges['SEL'].done && (this.userChallenges['SEL'].done = true), 1000) };
                } else { }; if (this.userChallenges['SEL'].done) { this.captureImage().then((img) => { this.userPictures.selfie.raw = img as Blob; this.stopTracking(false, 'SEL'); }); return; };
            }; this.tracking == true && window.requestAnimationFrame(predictWebcam);
        }; this.getUserMedia(predictWebcam, true); c('👨‍💻 - challenge ready and running...');
    }

    __docChallenge = async () => {
        const ccs = this.commonChallengeSet('DOC');
        if (!ccs) return;
        await this.initEmbedder();
        const userDocFront = document.body.appendChild(buildElement('img', { src: this.getDocumentByLocale(this.getLocaleCode()), class: 'user-document front-document' }))
        setTimeout(() => { // Wait for the image to be available.
            this.imageEmbeddings.front = this.imageEmbedder.embed(userDocFront as HTMLImageElement);
            /*TODO*/// this.imageEmbeddings.back = this.imageEmbedder.embed(userDocBack as HTMLImageElement);
            this.imageEmbedder.applyOptions({ runningMode: "VIDEO" });
            this.video.classList.add('unflip'); this.canvasElement.classList.add('unflip');
            let predictWebcam = async () => {
                this.canvasElement.width = this.video.videoWidth; this.canvasElement.height = this.video.videoHeight;
                ccs.time !== this.video.currentTime && (ccs.time = this.video.currentTime, ccs.results = this.imageEmbedder?.embedForVideo(this.video, Date.now()));// Send the video frame to the model.
                if (ccs.time > 0) {
                    document.querySelectorAll('.user-media:not(#user-overlay)')?.forEach(el => el.classList.add('tracking'));
                    if (!document.querySelector('.document-layout')) document.querySelector('.challenge-page')!.appendChild(buildElement('div', { class: 'user-media document-layout tracking' }, [docLayout]));
                    if (this.imageEmbeddings.front && ccs.results) { // The better the light and the camera, the better the results.
                        const similarity = ImageEmbedder.cosineSimilarity(this.imageEmbeddings.front!.embeddings[0], ccs.results.embeddings[0]);
                        if (this.devMode) this.toggleDevData('DOC', { similarity: similarity?.toString()?.substring(0, 5) });
                        if ((!this.isMobile() && similarity > 0.15) || (this.isMobile() && similarity > 0.4)) { // ^0.4
                            setTimeout(() => !this.userChallenges['DOC'].done && (this.userChallenges['DOC'].done = true), 1000); c('Match!');
                        }
                    }
                }
                if (this.userChallenges['DOC'].done) { this.captureImage('DOC').then((img) => { this.userPictures.doc.raw = img as Blob; this.stopTracking(false, 'DOC'); }); return; };
                this.tracking == true && window.requestAnimationFrame(predictWebcam);
            }
            const docLayout = this.getDocumentLayoutByLocale(this.getLocaleCode());
            this.getUserMedia(predictWebcam, { facingMode: 'environment', aspectRatio: { ideal: 16 / 9 } });
            c('challenge ready and running...');
        }, 500);
    }

    // SEL & DOC MATCH METHODS ###########################################################################
    // #########################################################################################
    // #########################################################################################
    async checkAndCompareUserPictures(type: 'SEL' | 'DOC') {
        // 1) Generate FaceLandmarks from image.
        // 2) Compose the canvas with the image and the landmarks to extract the face/mask.
        // 3) Compare the tow composed masks.
        if (this.userChallenges['SEL'].challenge && this.userChallenges['DOC'].challenge) {
            this.toggleLoader(true);
            if (type == 'SEL') await this.composeMaskedCanvas(this.userPictures.selfie.raw!, type);
            if (type == 'DOC') await this.composeMaskedCanvas(this.userPictures.doc.raw!, type);
            this.toggleLoader(false); c('MASK COMPOSED: ' + type);
            if (this.userPictures.selfie.masked != undefined && this.userPictures.doc.masked != undefined) {
                c('both masked images are ready to be compared');
                // Measure 1) Euclidean distance between the two Face Landmarks.
                const eDistanceBuffer = this.euclideanFromBuffer(this.userPictures.doc.buffer!, this.userPictures.selfie.buffer!);
                // Measure 2) Euclidean distance between the two Face Matrixs.
                const eDistanceMatrix = this.euclideanFromMatrix(this.userPictures.doc.matrix!, this.userPictures.selfie.matrix!);
                // Measure 3) Similarity score between the two Face Embeddings.
                this.imageEmbedder.applyOptions({ runningMode: "IMAGE" });
                const selfieEmbed = this.imageEmbedder.embed(this.userPictures.selfie.masked!);
                const docEmbed = this.imageEmbedder.embed(this.userPictures.doc.masked!);
                const similarity = ImageEmbedder.cosineSimilarity(selfieEmbed!.embeddings[0], docEmbed!.embeddings[0]);
                // Final Score: Average of the 3 measures with +25% weight for the similarity score.
                const overalMatch = (eDistanceBuffer + eDistanceMatrix + similarity + similarity) / 4; c('OVERAL FACES MATCH::: ' + overalMatch);
                if (this.devMode) this.toggleDevData('SELvsDOC', { similarity: overalMatch?.toString()?.substring(0, 5) });
                if (similarity > 0.8) { console.log('Match'); }
            } else c('one or both masked images are not ready to be compared' + this.userPictures.selfie.masked + this.userPictures.doc.masked);
        }
    }

    composeMaskedCanvas(imageParam: Blob, type: 'SEL' | 'DOC') {
        return new Promise((resolve, _) => {
            this.faceLandmarker.applyOptions({ runningMode: "IMAGE" });
            if (!document.querySelector('#composite-canvas')) document.body.appendChild(buildElement('canvas', { id: 'composite-canvas', class: this.devMode ? 'dev' : '' }));
            if (!document.querySelector('#composite-picture')) document.body.appendChild(buildElement('canvas', { id: 'composite-picture', class: this.devMode ? 'dev' : '' }));
            let canvas = document.querySelector('#composite-canvas') as HTMLCanvasElement;
            if (type == 'DOC') canvas = document.querySelector('#composite-picture') as HTMLCanvasElement;
            let ctx = canvas?.getContext('2d');
            const drawingUtils = new DrawingUtils(ctx!);
            const mlr = this.isMobile() ? type == 'SEL' ? 3.8 : 2.4 : 1;
            if (this.isMobile()) canvas.classList.add('is-mobile');

            let picture = new Image();
            picture.src = URL.createObjectURL(imageParam!);
            picture.onload = async () => {
                const landmarks = this.faceLandmarker.detect(picture);
                await new Promise((resolve, _) => setTimeout(() => resolve(null), 1000));
                if (!landmarks.faceLandmarks[0]) {
                    c('No landmarks found, user needs to retry...');
                    this.markAsFailed(type);
                    return;
                };
                this.userPictures[type == 'SEL' ? 'selfie' : 'doc'].buffer = landmarks.faceLandmarks![0];
                this.userPictures[type == 'SEL' ? 'selfie' : 'doc'].matrix = landmarks.facialTransformationMatrixes![0].data;
                this.markAsDone(type);
                canvas.width = picture.width; canvas.height = picture.height;
                drawingUtils.drawConnectors(landmarks.faceLandmarks[0], FaceLandmarker.FACE_LANDMARKS_TESSELATION, { color: "#FF0000", lineWidth: 10 * mlr })
                drawingUtils.drawLandmarks(landmarks.faceLandmarks[0], { color: "#FF0000", lineWidth: 5 * mlr, radius: !this.isMobile() ? type == 'SEL' ? 28 : 18 : 8 });
                canvas.toBlob((landmarkBlob) => {
                    ctx!.clearRect(0, 0, picture.width, picture.height);
                    let landmarkImage = new Image();
                    landmarkImage.src = URL.createObjectURL(landmarkBlob!);
                    landmarkImage.onload = () => {
                        canvas.width = picture.width; canvas.height = picture.height;
                        ctx!.globalCompositeOperation = 'source-over';

                        if (type == 'SEL') { ctx!.filter = 'grayscale(100%) contrast(80%) brightness(120%)'; }
                        if (type == 'DOC') { ctx!.filter = 'grayscale(100%)'; /*ctx!.scale(1, 1);*/ } // ctx!.filter = 'brightness(0%)';
                        if (type == 'SEL' && this.isMobile()) ctx!.scale(0.8, 0.8); else ctx!.scale(1, 1);

                        const faceTight = type == 'SEL' && !this.isMobile() ? picture.width * 0.10 : 0; // ~10% of the picture width to fit the face tightly.
                        ctx!.drawImage(picture, 0, 0, type == 'SEL' ? picture.width * 0.8 : picture.width, type == 'SEL' ? picture.height * 0.8 : picture.height);
                        ctx!.globalCompositeOperation = 'destination-in'; // Will mask the image with the landmarks.
                        ctx!.drawImage(landmarkImage, faceTight * 0.9, 0, (type == 'SEL' ? picture.width * 0.8 : picture.width) - (faceTight * 2), type == 'SEL' ? picture.height * 0.8 : picture.height);

                        canvas.toBlob((maskedBlob) => {
                            // ctx!.globalCompositeOperation = 'source-over';
                            // ctx!.filter = 'brightness(0%)';
                            let masked = new Image();
                            masked.src = URL.createObjectURL(maskedBlob!);
                            masked.onload = () => {
                                // Drawing tesselation above the masked images.
                                // ctx!.filter = 'none';
                                // const landmarksMasked = this.faceLandmarker.detect(masked);
                                // if (type == 'SEL' && this.isMobile()) ctx!.scale(0.8, 0.8); else ctx!.scale(1, 1);
                                // drawingUtils.drawConnectors(landmarks.faceLandmarks[0], FaceLandmarker.FACE_LANDMARKS_TESSELATION, { color: "#FF0000", lineWidth: 0.5 });
                                // canvas.toBlob((maskedLandmarkBlob) => {
                                //     let mlb = new Image();
                                //     mlb.src = URL.createObjectURL(maskedLandmarkBlob!);
                                //     mlb.onload = () => {
                                if (type == 'SEL') {
                                    this.userPictures.selfie.masked = masked!;
                                    resolve(masked!); // complete promise.
                                    if (this.devMode) this.base64FromBlob(maskedBlob!);
                                }
                                if (type == 'DOC') {
                                    this.userPictures.doc.masked = masked!;
                                    resolve(masked!); // complete promise.
                                    if (this.devMode) this.base64FromBlob(maskedBlob!);
                                }
                                //     };
                                // });

                            }
                        });
                    }
                });
            };
        })
    }


    // MATH UTILS ###########################################################################
    // #########################################################################################
    // #########################################################################################
    euclideanFromBuffer(a1: any, a2: any) {
        const euclideanDistance = (obj1: any, obj2: any) => Math.sqrt(Math.pow(obj1.x - obj2.x, 2) + Math.pow(obj1.y - obj2.y, 2) + Math.pow(obj1.z - obj2.z, 2));
        const compareArrays = (array1: any, array2: any) => {
            let totalDistance = 0;
            if (array1.length !== array2.length) throw new Error("Arrays must have the same length.");
            for (let i = 0; i < array1.length; i++) { const distance = euclideanDistance(array1[i], array2[i]); totalDistance += distance; }
            return 1 - (totalDistance / Math.sqrt(3 * Math.pow(array1.length, 2))); // Normalize the distance to get a score between 0 and 1.
        }
        return compareArrays(a1, a2);
    }

    euclideanFromMatrix(a1: any, a2: any) {
        const dotProduct = (arr1: any, arr2: any) => { let sum = 0; for (let i = 0; i < arr1.length; i++) { sum += arr1[i] * arr2[i]; } return sum; }
        const magnitude = (arr: any) => { let sum = 0; for (let i = 0; i < arr.length; i++) { sum += arr[i] * arr[i]; } return Math.sqrt(sum); }
        const compareArrays = (arr1: any, arr2: any) => {
            if (arr1.length !== arr2.length) throw new Error("Arrays must have the same length.");
            const dotProd = dotProduct(arr1, arr2); const mag1 = magnitude(arr1); const mag2 = magnitude(arr2);
            if (mag1 === 0 || mag2 === 0) return 0;
            return dotProd / (mag1 * mag2);
        }
        return compareArrays(a1, a2);
    }

    // DONE AND FAILED UTILS ###########################################################################
    // #########################################################################################
    // #########################################################################################
    markAsDone(type: 'SEL' | 'DOC' | 'POL' | 'KYC') {
        this.toggleLoader(false);
        setTimeout(() => {
            document.querySelector(`#${this.userChallenges[type].id}`)?.classList.toggle('challenge-done', true);
            document.querySelector(`#${this.userChallenges[type].id}`)?.classList.contains('challenge-failed') && document.querySelector(`#${this.userChallenges[type].id}`)?.classList.remove('challenge-failed')
        }, 300);
    }
    markAsFailed(type: 'SEL' | 'DOC' | 'POL' | 'KYC') {
        this.toggleLoader(false);
        setTimeout(() => document.querySelector(`#${this.userChallenges[type].id}`)?.classList.toggle('challenge-failed', true), 300);
    }

    // LOCALE UTILS. ###########################################################################
    // #########################################################################################
    // #########################################################################################

    getLocaleCode = () => 'es-UY';

    getDocumentByLocale(locale: string, isBack?: boolean) {
        switch (locale) {
            case 'es-UY': return `assets/locale/docs/uy/${!isBack ? 'doc_front' : 'doc_back'}.png`;
            default: return `assets/locale/docs/uy/${!isBack ? 'doc_front' : 'doc_back'}.png`;
        }
    }
    getDocumentLayoutByLocale(locale: string, isBack?: boolean) {
        switch (locale) {
            case 'es-UY': return buildElement('img', { src: `assets/locale/docs/uy/${!isBack ? 'layout_front' : 'layout_back'}.png`, class: 'user-media document-layout-picture' });
            default: return buildElement('img', { src: `assets/locale/docs/uy/${!isBack ? 'layout_front' : 'layout_back'}.png`, class: 'user-document-layout' });
        }
    }

    // TOGGLE DEV MODE ###########################################################################
    // #########################################################################################
    // #########################################################################################
    toggleDevData(type: 'SEL' | 'DOC' | 'POL' | 'SELvsDOC' | null, data: any, destroy?: boolean) {
        if (!this.devMode) return; if (destroy) return document.querySelector('#dev-data')?.remove();
        if (!document.querySelector('#dev-data')) { document.body.appendChild(buildElement('div', { id: 'dev-data' })) };
        if (type == 'DOC') { document.querySelector('#dev-data')!.innerHTML = `${type} - ${JSON.stringify(data)}`; }
        if (type == 'SELvsDOC') {
            document.querySelector('#dev-data')!.innerHTML = `${type} - ${JSON.stringify(data)}`;
            setTimeout(() => this.toggleDevData(null, null, true), 5000)
        }
    }


    // OHTER UTILS ###########################################################################
    // #########################################################################################
    // #########################################################################################
    isMobile = () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    // Detect undesired objets for selfie validations (sunglasses, caps, etc.);
    postSelfieValidation = async (): Promise<boolean> => {
        const unwanted = ['sunglasses', 'sunglass', 'cap', 'hat', 'headphones', 'headset', 'earphones', 'mask', 'gasmask', 'oxygen mask', 'ski mask', 'harmonica', 'ocarina', 'handkerchief', 'headgear', 'headwear', 'head covering'];
        this.toggleLoader(true); await this.initImageClassifier();
        return await new Promise((resolve, _) => {
            const picture = new Image(); picture.src = URL.createObjectURL(this.selfiePictures.close.raw!);
            picture.onload = async () => {
                const imageClassifierResult: ImageClassifierResult = this.imageClassifier.classify(picture);
                if (this.devMode) console.log('objects:', imageClassifierResult);
                if (imageClassifierResult?.classifications.length) {
                    let clearFace = true; imageClassifierResult.classifications[0].categories.filter((obj, i) => {
                        if (unwanted.some(catName => obj.categoryName == catName) &&
                            obj.score > (this.isMobile() ? 0.05 : 0.05)) { clearFace = false; resolve(clearFace); }
                        else { if (i == imageClassifierResult.classifications[0].categories.length - 1 && clearFace) resolve(clearFace); }
                    });
                }
            };
        });
    }

    captureImage(type?: 'SEL' | 'DOC') {// Utility to take pictures from video streams.
        return new Promise((resolve, _) => {
            if (type == 'DOC') { // Rotate the canvas by 90degs before drawing the video frame.
                const mlr = this.isMobile() ? 1.2 : 1.8;
                this.canvasCtx.translate(0, this.canvasElement.height * mlr);
                this.canvasCtx.rotate(-90 * Math.PI / 180);
                this.canvasCtx.scale(1.3, 1.3);
            }
            this.canvasCtx.drawImage(this.video, 0, 0, this.video.videoWidth, this.video.videoHeight);
            this.canvasElement.toBlob((blob) => { // Grab base64 and check the result.
                resolve(blob); if (this.devMode) this.base64FromBlob(blob!);
                if (type == 'DOC') {
                    this.canvasCtx.rotate(-90 * Math.PI / 180);
                    this.canvasCtx.translate(-this.canvasElement.width / 2, -this.canvasElement.height / 2);
                }
            });
        });
    }

    base64FromBlob(blob: Blob) {
        const reader = new FileReader();
        reader.onloadend = () => { console.log('👨‍💻 - image captured!', reader.result); };
        reader.readAsDataURL(blob!);
    }
}