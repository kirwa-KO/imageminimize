import { Buffer } from "node:buffer";
import { promises as fsPromises } from "node:fs";
import { promisify } from "node:util";
import path from "node:path";
import fs from "graceful-fs";
import FileType from "file-type";
import { globby } from "globby";
import pPipe from "p-pipe";
import replaceExt from "replace-ext";
import junk from "junk";
import convertToUnixPath from "slash";

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

const handleFile = async (sourcePath, { destination, plugins = [] }) => {
	if (plugins && !Array.isArray(plugins)) {
		throw new TypeError("The `plugins` option should be an `Array`");
	}

	let data = await readFile(sourcePath);
	data = await (plugins.length > 0 ? pPipe(...plugins)(data) : data);

	const { ext } = (await FileType.fromBuffer(data)) || {
		ext: path.extname(sourcePath),
	};
	let destinationPath = destination
		? path.join(destination, path.basename(sourcePath))
		: undefined;
	destinationPath =
		ext === "webp" ? replaceExt(destinationPath, ".webp") : destinationPath;

	const returnValue = {
		data,
		sourcePath,
		destinationPath,
	};

	if (!destinationPath) {
		return returnValue;
	}

	await fsPromises.mkdir(path.dirname(returnValue.destinationPath), {
		recursive: true,
	});
	await writeFile(returnValue.destinationPath, returnValue.data);

	return returnValue;
};

export default async function imageminimize(
	input,
	{ glob = true, excludeFiles, ...options } = {}
) {

	if (!Array.isArray(input)) {
		throw new TypeError(`Expected an \`Array\`, got \`${typeof input}\``);
	}

	const unixFilePaths = input.map((path) => convertToUnixPath(path));
	const filePaths = glob
		? await globby(unixFilePaths, { onlyFiles: true })
		: input;

	const result = [];

	for (const file of filePaths) {
		if (!junk.not(path.basename(file))) {
			continue;
		}

		try {
			// console.log(file);
			if (isFiletoExclude(file, excludeFiles)) {
				continue;
			}
			result.push(await handleFile(file, options));
		} catch (error) {
			error.message = `Error occurred when handling file: ${input}\n\n${error.stack}`;
			throw error;
		}
	}

	return result;
}

imageminimize.buffer = async (input, { plugins = [] } = {}) => {
	if (!Buffer.isBuffer(input)) {
		throw new TypeError(`Expected a \`Buffer\`, got \`${typeof input}\``);
	}

	if (plugins.length === 0) {
		return input;
	}

	return pPipe(...plugins)(input);
};

const isFiletoExclude = (file, excludeFiles) => {
	if (!excludeFiles) {
		return false;
	}
	return excludeFiles.some((excludeFile) => file.includes(excludeFile));
}
