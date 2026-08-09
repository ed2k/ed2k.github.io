#!/usr/bin/env python3
"""
Export TensorFlow 1.x Checkpoint Models in BEN to JSON for browser TF.js execution.
Supports TensorFlow 2.x via tf.compat.v1 compatibility module.
"""

import os
import sys
import json
import pathlib

# Add src to sys.path
BASE_DIR = pathlib.Path(__file__).parents[1].resolve()
sys.path.insert(0, str(BASE_DIR / 'src'))

import tensorflow as tf
import tensorflow.compat.v1 as tf_v1
tf_v1.disable_eager_execution()

def export_checkpoint_weights(meta_path, output_json_path):
    print(f"Exporting {meta_path} -> {output_json_path}")
    tf_v1.reset_default_graph()
    
    graph = tf_v1.Graph()
    with graph.as_default():
        sess = tf_v1.Session()
        checkpoint_prefix = str(meta_path).replace('.meta', '')
        saver = tf_v1.train.import_meta_graph(str(meta_path))
        saver.restore(sess, checkpoint_prefix)
        
        weights_dict = {}
        for v in tf_v1.global_variables():
            name = v.name.split(':')[0]
            val = sess.run(v)
            weights_dict[name] = val.tolist()
            print(f"  Var: {name}, Shape: {val.shape}")
            
        sess.close()
        
    os.makedirs(os.path.dirname(output_json_path), exist_ok=True)
    with open(output_json_path, 'w') as f:
        json.dump(weights_dict, f)
    print(f"Done! Saved {output_json_path} ({os.path.getsize(output_json_path)} bytes)\n")

def main():
    models_root = BASE_DIR / 'models'
    web_models_dir = BASE_DIR / 'web' / 'models'
    
    model_targets = {
        'bidder': models_root / 'gib21_model' / 'gib21-1000000.meta',
        'binfo': models_root / 'gib21_info_model' / 'gib21_info-500000.meta',
        'lead': models_root / 'lead_model_b' / 'lead-1000000.meta',
        'sd_model': models_root / 'lr3_model' / 'lr3-1000000.meta',
        'lefty': models_root / 'lefty_model' / 'lefty-1000000.meta',
        'dummy': models_root / 'dummy_model' / 'dummy-920000.meta',
        'righty': models_root / 'righty_model' / 'righty-1000000.meta',
        'decl': models_root / 'decl_model' / 'decl-1000000.meta',
    }
    
    for name, meta_path in model_targets.items():
        if meta_path.exists():
            export_checkpoint_weights(meta_path, web_models_dir / f"{name}.json")
        else:
            print(f"Warning: {meta_path} does not exist!")

if __name__ == '__main__':
    main()
