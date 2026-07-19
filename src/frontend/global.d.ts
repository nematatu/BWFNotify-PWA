declare module "*.css";
declare module "*.svg";
declare module "*.png";
declare module "*.jpg";

interface ImportMetaEnv {
	readonly DEV: boolean;
	readonly PROD: boolean;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
