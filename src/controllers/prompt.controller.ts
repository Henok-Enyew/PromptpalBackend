import { Request, Response, NextFunction } from 'express';
import catchAsync from '../utils/catchAsync.util.js';
import * as promptService from '../services/prompt.service.js';
import {
  FeedQueryParams,
  GetPromptParams,
  GetPromptBySlugParams,
  CreateVersionInput,
  VersionParams,
  ReplaceTestCasesInput,
} from '../validation/prompt.schema.js';
import AppError from '../utils/appError.util.js';

// Helper function to parse FormData array notation into proper objects
const parseFormDataArrays = (body: any) => {
  const parsed = { ...body };
  
  // Parse outputs array if present in FormData notation
  if (body.outputs && typeof body.outputs === 'object' && !Array.isArray(body.outputs)) {
    // FormData sends outputs as { '0': { type: '...', content: '...' }, '1': {...} }
    const outputsArray: any[] = [];
    const keys = Object.keys(body.outputs).sort((a, b) => parseInt(a) - parseInt(b));
    keys.forEach(key => {
      const index = parseInt(key);
      if (!isNaN(index)) {
        outputsArray[index] = body.outputs[key];
      }
    });
    parsed.outputs = outputsArray.filter(o => o !== undefined);
  }
  
  return parsed;
};

export const createPrompt = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('You must be logged in to create a prompt.', 401);
    }

    // Parse FormData arrays before processing
    req.body = parseFormDataArrays(req.body);
    
    const { mediaType, outputs } = req.body;
    let imageUrl: string | undefined;

    // Handle multiple outputs if provided
    if (outputs && Array.isArray(outputs) && outputs.length > 0) {
      // Process outputs array and handle file uploads
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      const outputFiles = files?.outputFiles || [];
      const legacyImageFile = files?.image?.[0] || (req as any).file;
      
      // Map output files to their indices
      const outputIndices = req.body.outputIndices 
        ? (Array.isArray(req.body.outputIndices) ? req.body.outputIndices : [req.body.outputIndices])
        : [];
      
      // Count image outputs that need files
      const imageOutputs = outputs.filter((o: any) => o.type === 'image' && (!o.content || o.content.trim() === ''));
      
      // Validate that we have files for all image outputs
      if (imageOutputs.length > 0 && outputFiles.length === 0 && !legacyImageFile) {
        throw new AppError('Image file is required for image outputs.', 400);
      }
      
      // Update outputs with file URLs
      const processedOutputs = outputs.map((output: any, index: number) => {
        if (output.type === 'image' && (!output.content || output.content.trim() === '')) {
          // Find the corresponding file for this output
          // outputIndices contains the output index for each file
          const fileIndex = outputIndices.findIndex((idx: string) => parseInt(idx) === index);
          if (fileIndex !== -1 && outputFiles[fileIndex]) {
            const fileUrl = outputFiles[fileIndex].path;
            // Use first image output as the main imageUrl for backward compatibility
            if (!imageUrl) {
              imageUrl = fileUrl;
            }
            return {
              ...output,
              content: fileUrl,
            };
          } else {
            // Image output but no file found - try to map by order
            const imageOutputIndex = outputs.slice(0, index).filter((o: any) => o.type === 'image' && (!o.content || o.content.trim() === '')).length;
            if (imageOutputIndex < outputFiles.length) {
              const fileUrl = outputFiles[imageOutputIndex].path;
              if (!imageUrl) {
                imageUrl = fileUrl;
              }
              return {
                ...output,
                content: fileUrl,
              };
            }
            // Still no file - this is an error
            throw new AppError(`Image file is required for image output at index ${index}.`, 400);
          }
        }
        return output;
      });
      
      req.body.outputs = processedOutputs;
      
      // If mediaType is 'image', ensure we have an image
      if (mediaType === 'image') {
        // First, try to get imageUrl from processed outputs
        const firstImageOutput = processedOutputs.find((o: any) => o.type === 'image' && o.content);
        if (firstImageOutput) {
          imageUrl = firstImageOutput.content;
        } else if (legacyImageFile) {
          // Fallback to legacy image file
          imageUrl = legacyImageFile.path;
          // If first output is image type but has no content, use legacy image
          if (processedOutputs[0]?.type === 'image' && !processedOutputs[0].content) {
            processedOutputs[0].content = imageUrl;
            req.body.outputs = processedOutputs;
          }
        } else {
          // Check if we have image outputs that need files
          const hasImageOutputs = processedOutputs.some((o: any) => o.type === 'image');
          if (hasImageOutputs) {
            // We have image outputs - check if files were uploaded
            if (outputFiles.length === 0) {
              throw new AppError('Image file is required for image media type.', 400);
            }
            
            // If we have files but they weren't mapped correctly, try to map them by order
            const imageOutputsWithoutContent = processedOutputs.filter((o: any) => o.type === 'image' && !o.content);
            if (imageOutputsWithoutContent.length > 0 && outputFiles.length > 0) {
              // Map files to image outputs by order (first file to first image output, etc.)
              let fileIndex = 0;
              processedOutputs.forEach((o: any) => {
                if (o.type === 'image' && !o.content && fileIndex < outputFiles.length) {
                  o.content = outputFiles[fileIndex].path;
                  if (!imageUrl) {
                    imageUrl = o.content;
                  }
                  fileIndex++;
                }
              });
              req.body.outputs = processedOutputs;
            }
            
            // Final check: if we still don't have imageUrl, it's an error
            if (!imageUrl) {
              throw new AppError('Image file is required for image media type.', 400);
            }
          } else {
            // No image outputs but mediaType is 'image' - need legacy image
            throw new AppError('Image file is required for image media type.', 400);
          }
        }
      }
    } else {
      // Legacy single output support
      if (mediaType === 'image') {
        const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
        // Check both 'image' field and legacy single file
        const imageFile = files?.image?.[0] || (req as any).file;
        if (!imageFile) {
          throw new AppError('Image file is required for image media type.', 400);
        }
        imageUrl = imageFile.path;
      } else {
        if (!req.body.sampleOutput) {
          throw new AppError(
            'Sample output is required for non-image media types.',
            400,
          );
        }
      }
    }

    const prompt = await promptService.createPrompt(
      req.user.id,
      req.body,
      imageUrl,
    );

    res.status(201).json({
      status: 'success',
      data: {
        prompt,
      },
    });
  },
);

export const getFeed = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const query = req.query as unknown as FeedQueryParams;
    const data = await promptService.getFeed(query);

    res.status(200).json({
      status: 'success',
      data: {
        prompts: data.prompts,
        pagination: {
          total: data.total,
          page: data.page,
          totalPages: data.totalPages,
          limit: data.limit,
        },
      },
    });
  },
);

export const getPrompt = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params as GetPromptParams;

    const prompt = await promptService.getPromptById(id, req.user);

    res.status(200).json({
      status: 'success',
      data: {
        prompt,
      },
    });
  },
);

export const getPromptBySlug = catchAsync(
  async (req: Request, res: Response) => {
    const { slug } = req.params as GetPromptBySlugParams;
    const prompt = await promptService.getPromptBySlug(slug, req.user);

    res.status(200).json({
      status: 'success',
      data: {
        prompt,
      },
    });
  },
);

export const updatePrompt = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('You must be logged in to update a prompt.', 401);
    }

    const { id } = req.params as GetPromptParams;
    const { mediaType, outputs } = req.body;
    let imageUrl: string | undefined;

    // Handle multiple outputs if provided
    if (outputs && Array.isArray(outputs) && outputs.length > 0) {
      // Process outputs array and handle file uploads
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      const outputFiles = files?.outputFiles || [];
      const legacyImageFile = files?.image?.[0] || (req as any).file;
      
      // Map output files to their indices
      const outputIndices = req.body.outputIndices 
        ? (Array.isArray(req.body.outputIndices) ? req.body.outputIndices : [req.body.outputIndices])
        : [];
      
      // Count image outputs that need files
      const imageOutputs = outputs.filter((o: any) => o.type === 'image' && (!o.content || o.content.trim() === ''));
      
      // Validate that we have files for all image outputs
      if (imageOutputs.length > 0 && outputFiles.length === 0 && !legacyImageFile) {
        throw new AppError('Image file is required for image outputs.', 400);
      }
      
      // Update outputs with file URLs
      const processedOutputs = outputs.map((output: any, index: number) => {
        if (output.type === 'image' && (!output.content || output.content.trim() === '')) {
          // Find the corresponding file for this output
          const fileIndex = outputIndices.findIndex((idx: string) => parseInt(idx) === index);
          if (fileIndex !== -1 && outputFiles[fileIndex]) {
            const fileUrl = outputFiles[fileIndex].path;
            // Use first image output as the main imageUrl for backward compatibility
            if (!imageUrl) {
              imageUrl = fileUrl;
            }
            return {
              ...output,
              content: fileUrl,
            };
          } else {
            // Image output but no file found - try to map by order
            const imageOutputIndex = outputs.slice(0, index).filter((o: any) => o.type === 'image' && (!o.content || o.content.trim() === '')).length;
            if (imageOutputIndex < outputFiles.length) {
              const fileUrl = outputFiles[imageOutputIndex].path;
              if (!imageUrl) {
                imageUrl = fileUrl;
              }
              return {
                ...output,
                content: fileUrl,
              };
            }
            // Still no file - this is an error
            throw new AppError(`Image file is required for image output at index ${index}.`, 400);
          }
        }
        return output;
      });
      
      req.body.outputs = processedOutputs;
      
      // If mediaType is 'image', ensure we have an image
      if (mediaType === 'image') {
        // First, try to get imageUrl from processed outputs
        const firstImageOutput = processedOutputs.find((o: any) => o.type === 'image' && o.content);
        if (firstImageOutput) {
          imageUrl = firstImageOutput.content;
        } else if (legacyImageFile) {
          // Fallback to legacy image file
          imageUrl = legacyImageFile.path;
          // If first output is image type but has no content, use legacy image
          if (processedOutputs[0]?.type === 'image' && !processedOutputs[0].content) {
            processedOutputs[0].content = imageUrl;
            req.body.outputs = processedOutputs;
          }
        } else {
          // Check if we have image outputs that need files
          const hasImageOutputs = processedOutputs.some((o: any) => o.type === 'image');
          if (hasImageOutputs) {
            // We have image outputs - check if files were uploaded
            if (outputFiles.length === 0) {
              throw new AppError('Image file is required for image media type.', 400);
            }
          } else {
            // No image outputs but mediaType is 'image' - need legacy image
            throw new AppError('Image file is required for image media type.', 400);
          }
        }
      }
    } else {
      // Legacy single output support
      if (mediaType === 'image') {
        const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
        // Check both 'image' field and legacy single file
        const imageFile = files?.image?.[0] || (req as any).file;
        if (imageFile) {
          imageUrl = imageFile.path;
        }
      }
    }

    const prompt = await promptService.updatePrompt(
      id,
      req.user.id,
      req.body,
      req.user.role,
      imageUrl,
    );

    res.status(200).json({
      status: 'success',
      data: {
        prompt,
      },
    });
  },
);

export const deletePrompt = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('You must be logged in to delete a prompt.', 401);
    }

    const { id } = req.params as GetPromptParams;
    const result = await promptService.deletePrompt(
      id,
      req.user.id,
      req.user.role,
    );

    res.status(200).json({
      status: 'success',
      message: result.message,
    });
  },
);

export const toggleLike = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('You must be logged in to like a prompt.', 401);
    }

    const { id } = req.params as GetPromptParams;
    const prompt = await promptService.toggleLike(id, req.user);

    res.status(200).json({
      status: 'success',
      data: {
        prompt,
      },
    });
  },
);

export const sharePrompt = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params as GetPromptParams;
    const result = await promptService.incrementShare(id, req.user);

    res.status(200).json({
      status: 'success',
      data: {
        shareableUrl: result.shareableUrl,
        sharesCount: result.sharesCount,
      },
    });
  },
);

export const getUserPrompts = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('You must be logged in to view your prompts.', 401);
    }

    const query = req.query as unknown as FeedQueryParams;
    const data = await promptService.getUserPrompts(req.user.id, query);

    res.status(200).json({
      status: 'success',
      data: {
        prompts: data.prompts,
        pagination: {
          total: data.total,
          page: data.page,
          totalPages: data.totalPages,
          limit: data.limit,
        },
      },
    });
  },
);

export const getUserFavorites = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('You must be logged in to view your favorites.', 401);
    }

    const query = req.query as unknown as FeedQueryParams;
    const data = await promptService.getUserFavorites(req.user.id, query);

    res.status(200).json({
      status: 'success',
      data: {
        prompts: data.prompts,
        pagination: {
          total: data.total,
          page: data.page,
          totalPages: data.totalPages,
          limit: data.limit,
        },
      },
    });
  },
);
// Version history and test cases (owner-only; `protect` guarantees req.user)

export const getVersions = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params as GetPromptParams;
  const data = await promptService.getPromptVersions(id, req.user!);
  res.status(200).json({ status: 'success', data });
});

export const createVersion = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params as GetPromptParams;
  const data = await promptService.createPromptVersion(id, req.user!, req.body as CreateVersionInput);
  res.status(201).json({ status: 'success', data });
});

export const restoreVersion = catchAsync(async (req: Request, res: Response) => {
  const { id, versionNumber } = req.params as unknown as VersionParams;
  const data = await promptService.restorePromptVersion(id, versionNumber, req.user!);
  res.status(201).json({ status: 'success', data });
});

export const getTestCases = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params as GetPromptParams;
  const data = await promptService.getPromptTestCases(id, req.user!);
  res.status(200).json({ status: 'success', data });
});

export const replaceTestCases = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params as GetPromptParams;
  const { testCases } = req.body as ReplaceTestCasesInput;
  const data = await promptService.replacePromptTestCases(id, req.user!, testCases);
  res.status(200).json({ status: 'success', data });
});
