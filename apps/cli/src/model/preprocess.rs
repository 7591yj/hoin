use image::{DynamicImage, imageops::FilterType};

pub(super) const IMAGE_SIZE: u32 = 224;

const IMAGE_NET_MEAN: [f32; 3] = [0.485, 0.456, 0.406];
const IMAGE_NET_STD: [f32; 3] = [0.229, 0.224, 0.225];

pub(super) fn preprocess_image(image: &DynamicImage) -> Vec<f32> {
    let resized = image
        .resize_exact(IMAGE_SIZE, IMAGE_SIZE, FilterType::Triangle)
        .to_rgb8();
    let mut input = vec![0.0_f32; (3 * IMAGE_SIZE * IMAGE_SIZE) as usize];

    for (x, y, pixel) in resized.enumerate_pixels() {
        let [r, g, b] = pixel.0;
        let offset = (y * IMAGE_SIZE + x) as usize;

        input[offset] = normalize_channel(r, 0);
        input[(IMAGE_SIZE * IMAGE_SIZE) as usize + offset] = normalize_channel(g, 1);
        input[(2 * IMAGE_SIZE * IMAGE_SIZE) as usize + offset] = normalize_channel(b, 2);
    }

    input
}

fn normalize_channel(value: u8, channel: usize) -> f32 {
    let scaled = f32::from(value) / 255.0;
    (scaled - IMAGE_NET_MEAN[channel]) / IMAGE_NET_STD[channel]
}
